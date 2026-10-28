#!/bin/bash
#
# Minify the site and its server and ready them for deployment.
#
#   ./scripts/build.sh -o ./dist
#
# Dark Breezy's build, from playthroughapps.com's compress.sh (same author); see
# docs/cache-bust.md and DARKBREEZY.md §10a.
#
# Two folders of the repository, each into its own folder of the output:
#
#   web/      the site                  -> <output>/web/     (the web root)
#   server/   how the site's to be served -> <output>/server/
#
# Each is walked, and a minified copy written, file by file, as
# rbashutils-web.sh's compressWeb does:
#
#   .js .mjs          esbuild, one file at a time - modules keep their
#                     imports, exports and import.meta.url exactly
#   .css              esbuild
#   .html .htm        html-minifier-terser, inline script and style too
#   .json .webmanifest   re-written without whitespace
#   .frag .vert .glsl    comments and blank lines taken out
#   .svg              comments and the whitespace between tags taken out
#   anything else     copied as it is (images, sound...)
#
# Files with .min. in their name, and everything in vendor/ (pinned, with
# SRI hashes in index.html), are copied untouched, a file whose output is
# already newer than it is skipped (unless -f), and a file a minifier fails
# on is copied as it was, with a warning. README and dot files are left out.
# Every minified script is then parsed by node, so a broken one can't ship.
# 404.html, the not-found page hosts send for unknown addresses (server.json's
# notFound, GitHub Pages), is a page of its own (web/404.html).
# Last, for the site's updater (js/update.js), two files are written into
# <output>/web: files-<build>.json, every refreshable file with a hash of its
# contents, and deployment.json, a few bytes naming the build and that list.
# Files over 2 MiB are still published, but left out of the updater, and so
# is js/cache-bust.js: it's for development, and the updater imports it itself.
# The server folder has neither: no page ever fetches it.
#
# The minifiers are fetched once, at the pinned versions below, into
# $WJ_TOOLS (default ~/.cache/wheresjames-tools) - nothing is installed
# globally. Needs node and npm.

ESBUILD_VERSION="0.28.2"
HTMLMIN_VERSION="7.2.0"

#-------------------------------------------------------------------------------
# Output

if [[ -t 1 ]]; then
    RED=$'\e[31m'; YELLOW=$'\e[33m'; GREEN=$'\e[32m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
else
    RED=; YELLOW=; GREEN=; BOLD=; RESET=
fi
showInfo()      { echo "${BOLD}$*${RESET}"; }
showWarning()   { echo "${YELLOW}!!! $*${RESET}" >&2; }
exitWithError() { echo "${RED}*** $*${RESET}" >&2; exit 1; }

usage()
{
    cat <<EOF
Usage: $(basename "$0") [-o <output dir>] [-b <base path>] [-c] [-f] [-z] [-q]

  -o DIR   where the compressed copy goes, web/ and server/ inside it; made
           if missing (default: dist in the repository)
  -b PATH  the path the site is served under, when not the domain's root
           (GitHub Pages without a custom domain: /<repository>). Only the
           not-found page needs it: it's sent at any address, so its links
           start from the root
  -c       clean: empty the output folder first, so files deleted from the
           input don't linger in it
  -f       force: redo every file, even ones whose output is up to date
  -z       also write a .gz beside each of the site's text files, for
           servers that send pre-compressed files (nginx gzip_static, say);
           server.json's "precompressed" says whether they're there.
           Without it, .gz files from an earlier build are taken away
  -q       quiet: only warnings, errors and the summary
  -h       this help
EOF
}

#-------------------------------------------------------------------------------
# Options

REPO=$(cd "$(dirname "$0")/.." && pwd -P)
OUTPUT="$REPO/dist"; CLEAN=; FORCE=; GZIP=; QUIET=; BASE=
while getopts ":i:o:b:cfzqh" opt; do
    case $opt in
        i) exitWithError "-i is gone: the input is always the repository's web/ and server/ (output: <dir>/web, <dir>/server)" ;;
        o) OUTPUT="$OPTARG" ;;
        b) BASE="${OPTARG%/}" ;;
        c) CLEAN=1 ;;
        f) FORCE=1 ;;
        z) GZIP=1 ;;
        q) QUIET=1 ;;
        h) usage; exit 0 ;;
        :) usage >&2; exitWithError "-$OPTARG needs a value" ;;
        *) usage >&2; exitWithError "Unknown option: -$OPTARG" ;;
    esac
done

[[ -n "$OUTPUT" ]] || { usage >&2; exitWithError "-o needs a folder"; }
WEB_ABS="$REPO/web"
SERVER_ABS="$REPO/server"
[[ -d "$WEB_ABS" ]] || exitWithError "No site to compress: $WEB_ABS"
[[ -d "$SERVER_ABS" ]] || exitWithError "No server folder: $SERVER_ABS"

# Where the output would be, worked out before anything is made there.
OUTPUT_ABS=$(realpath -m "$OUTPUT")

# Never write into an input, or read from the output.
for IN_ABS in "$WEB_ABS" "$SERVER_ABS"; do
    case "$OUTPUT_ABS/" in "$IN_ABS/"*) exitWithError "The output folder can't be in $IN_ABS" ;; esac
    case "$IN_ABS/" in "$OUTPUT_ABS/"*) exitWithError "$IN_ABS can't be inside the output folder" ;; esac
done
[[ -e "$OUTPUT_ABS" && ! -d "$OUTPUT_ABS" ]] && exitWithError "The output isn't a folder: $OUTPUT"

if [[ -n "$CLEAN" ]]; then
    # Only a plain folder of our own making: never /, home, or the repository.
    case "$OUTPUT_ABS" in
        /|"$HOME"|"$REPO") exitWithError "Refusing to clean $OUTPUT_ABS" ;;
    esac
    [[ -n "$QUIET" ]] || showInfo "- Cleaning : $OUTPUT_ABS"
    [[ ! -d "$OUTPUT_ABS" ]] || find "$OUTPUT_ABS" -mindepth 1 -delete || exitWithError "Couldn't clean $OUTPUT_ABS"
fi
mkdir -p "$OUTPUT_ABS" || exitWithError "Couldn't make the output folder: $OUTPUT"
# Built before web/ and server/ had folders of their own: the site's files
# would linger at the top, beside them.
if [[ -z "$CLEAN" && -f "$OUTPUT_ABS/deployment.json" ]]; then
    showWarning "$OUTPUT has an old build at its top level (the site's now in $OUTPUT/web) - run with -c to clear it"
fi

#-------------------------------------------------------------------------------
# Tools

command -v node >/dev/null || exitWithError "node isn't installed"
command -v npm >/dev/null || exitWithError "npm isn't installed"

TOOLS="${WJ_TOOLS:-${XDG_CACHE_HOME:-$HOME/.cache}/wheresjames-tools}"
ESBUILD="$TOOLS/node_modules/.bin/esbuild"
HTMLMIN="$TOOLS/node_modules/.bin/html-minifier-terser"

toolsReady()
{
    [[ -x "$ESBUILD" && -x "$HTMLMIN" ]] || return 1
    [[ "$("$ESBUILD" --version 2>/dev/null)" == "$ESBUILD_VERSION" ]] || return 1
    [[ "$("$HTMLMIN" --version 2>/dev/null)" == *"$HTMLMIN_VERSION"* ]] || return 1
}

if ! toolsReady; then
    showInfo "- Fetching minifiers into $TOOLS (once)"
    mkdir -p "$TOOLS" || exitWithError "Couldn't make $TOOLS"
    npm install --prefix "$TOOLS" --no-audit --no-fund --loglevel=error \
        "esbuild@$ESBUILD_VERSION" "html-minifier-terser@$HTMLMIN_VERSION" \
        || exitWithError "npm couldn't fetch the minifiers"
    toolsReady || exitWithError "The minifiers didn't install properly in $TOOLS"
fi

#-------------------------------------------------------------------------------
# The small transforms, in node: JSON, shaders and SVG.

# node <script> <kind> <src> <tgt>
TRANSFORM=$(cat <<'EOF'
const fs = require('fs');
const [kind, src, tgt] = process.argv.slice(1);
let text = fs.readFileSync(src, 'utf8');
if (kind === 'json') {
    text = JSON.stringify(JSON.parse(text));
} else if (kind === 'glsl') {
    // GLSL has no strings, so comments can go outright. Lines stay lines:
    // the preprocessor (#ifdef, #define) is line by line.
    text = text.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean).join('\n') + '\n';
} else if (kind === 'svg') {
    text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').trim();
}
fs.writeFileSync(tgt, text);
EOF
)

#-------------------------------------------------------------------------------
# One file

WARNINGS=0
JSFILES=()

# minify <src> <tgt> <what>: run the minifier; on failure, copy and warn.
minify()
{
    local SRC="$1" TGT="$2" KIND="$3" ERR
    case "$KIND" in
        js)   ERR=$("$ESBUILD" "$SRC" --minify --legal-comments=none --charset=utf8 --log-level=error --outfile="$TGT" 2>&1) ;;
        css)  ERR=$("$ESBUILD" "$SRC" --minify --legal-comments=none --charset=utf8 --log-level=error --outfile="$TGT" 2>&1) ;;
        html) ERR=$("$HTMLMIN" --collapse-whitespace --conservative-collapse --remove-comments \
                        --minify-css true --minify-js true -o "$TGT" "$SRC" 2>&1) ;;
        json|glsl|svg) ERR=$(node -e "$TRANSFORM" "$KIND" "$SRC" "$TGT" 2>&1) ;;
    esac
    if [[ $? -ne 0 ]]; then
        showWarning "Couldn't minify $SRC - copied as it is${ERR:+: ${ERR%%$'\n'*}}"
        WARNINGS=$((WARNINGS + 1))
        cp -p "$SRC" "$TGT" || exitWithError "Couldn't copy $SRC -> $TGT"
    fi
}

compressFile()
{
    local SRC="$1" REL="$2" TGT="$TREE_OUT/$2" PROG="$3"
    local NAME="${REL##*/}" EXT="${REL##*.}" KIND
    EXT="${EXT,,}"
    mkdir -p "$(dirname "$TGT")" || exitWithError "Couldn't make $(dirname "$TGT")"

    case "$EXT" in
        js|mjs)           KIND=js ;;
        css)              KIND=css ;;
        html|htm)         KIND=html ;;
        json|webmanifest) KIND=json ;;
        frag|vert|glsl)   KIND=glsl ;;
        svg)              KIND=svg ;;
        *)                KIND=copy ;;
    esac
    [[ "$NAME" == *.min.* || "$REL" == vendor/* ]] && KIND=copy
    [[ "$KIND" == js ]] && JSFILES+=("$TGT")

    # Up to date: the output is there and the source isn't newer (a plain
    # copy keeps its source's time, so the two can be equal).
    if [[ -z "$FORCE" && -f "$TGT" && ! "$SRC" -nt "$TGT" ]]; then
        [[ -n "$QUIET" ]] || printf '%s %-5s : %s\n' "$PROG" "up2dt" "$REL"
        gzipFile "$TGT" "$KIND"
        return
    fi
    [[ -n "$QUIET" ]] || printf '%s %-5s : %s\n' "$PROG" "$KIND" "$REL"

    if [[ "$KIND" == copy ]]; then
        cp -p "$SRC" "$TGT" || exitWithError "Couldn't copy $SRC -> $TGT"
    else
        minify "$SRC" "$TGT" "$KIND"
    fi

    gzipFile "$TGT" "$KIND"
}

# gzipFile <output> <kind>: with -z, its .gz beside it, made again if it's
# older than the file. Without, any .gz left from an earlier -z build taken
# away - a server sending .gz files in place of the originals (gzip_static)
# would otherwise send that stale copy.
gzipFile()
{
    local TGT="$1" KIND="$2"
    if [[ -n "$GZIP" && -n "$TREE_GZIP" && "$KIND" != copy ]]; then
        [[ -f "$TGT.gz" && ! "$TGT" -nt "$TGT.gz" ]] && return
        gzip -9 -n -k -f "$TGT" || { showWarning "Couldn't gzip $TGT"; WARNINGS=$((WARNINGS + 1)); }
    elif [[ -f "$TGT.gz" ]]; then
        rm -f "$TGT.gz" || { showWarning "Couldn't remove the stale $TGT.gz"; WARNINGS=$((WARNINGS + 1)); }
    fi
}

#-------------------------------------------------------------------------------
# The two folders

IN_SIZE=0
TOTAL=0

# compressTree <input> <output> <gzip too, 1 or empty>: every file of one
# folder. Its files are left in FILES, relative to it.
compressTree()
{
    local TREE_IN="$1" COUNT=0 N FILE REL
    TREE_OUT="$2"; TREE_GZIP="$3"
    [[ -n "$QUIET" ]] || showInfo "- Compressing : $TREE_IN -> $TREE_OUT"
    mkdir -p "$TREE_OUT" || exitWithError "Couldn't make $TREE_OUT"
    # Everything but dot files and folders, and READMEs.
    mapfile -d '' FILES < <(cd "$TREE_IN" && find . -path '*/.*' -prune -o -type f ! -iname 'readme*' ! -iname '*.md' -print0 | sort -z)
    N=${#FILES[@]}
    [[ $N -gt 0 ]] || exitWithError "Nothing to compress in $TREE_IN"
    for FILE in "${FILES[@]}"; do
        COUNT=$((COUNT + 1))
        REL="${FILE#./}"
        compressFile "$TREE_IN/$REL" "$REL" "[$(printf '%3d' $((COUNT * 100 / N)))%]"
    done
    TOTAL=$((TOTAL + N))
    IN_SIZE=$((IN_SIZE + $(cd "$TREE_IN" && printf '%s\0' "${FILES[@]}" | du -cb --files0-from=- | tail -1 | cut -f1)))
}

# The server first, so FILES is the site's for its file list below.
compressTree "$SERVER_ABS" "$OUTPUT_ABS/server" ""
compressTree "$WEB_ABS" "$OUTPUT_ABS/web" 1

# Served under a path (-b): the not-found page's root-relative links get it,
# before the file list below hashes the page.
if [[ -n "$BASE" ]]; then
    [[ "$BASE" =~ ^/[A-Za-z0-9._~/-]*$ ]] || exitWithError "-b needs a path like /darkbreezy"
    node -e '
        const fs = require("fs"), [file, base] = process.argv.slice(1);
        const html = fs.readFileSync(file, "utf8").replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`);
        fs.writeFileSync(file, html);
    ' "$OUTPUT_ABS/web/404.html" "$BASE" || exitWithError "Couldn't set the base path in 404.html"
    [[ -z "$GZIP" ]] || gzip -9 -n -k -f "$OUTPUT_ABS/web/404.html"
    [[ -n "$QUIET" ]] || showInfo "- Base path: $BASE (404.html)"
fi

# server.json says what the build has: the .gz files with -z, none without.
# Written every time, as the flag can change while the file doesn't.
if [[ -f "$OUTPUT_ABS/server/server.json" ]]; then
    node -e '
        const fs = require("fs"), [file, gzip] = process.argv.slice(1);
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        json.precompressed = gzip ? ["gzip"] : [];
        fs.writeFileSync(file, JSON.stringify(json));
    ' "$OUTPUT_ABS/server/server.json" "$GZIP" || exitWithError "Couldn't set precompressed in server.json"
fi

# Every script must still parse - as a module, or failing that a classic script.
BROKEN=0
for JS in "${JSFILES[@]}"; do
    if ! node --check --input-type=module < "$JS" >/dev/null 2>&1 && ! node --check "$JS" >/dev/null 2>&1; then
        echo "${RED}*** Doesn't parse after minifying: ${JS#"$OUTPUT_ABS"/}${RESET}" >&2
        BROKEN=$((BROKEN + 1))
    fi
done

#-------------------------------------------------------------------------------
# The deployment, for the site's updater (js/update.js), in <output>/web: the file list,
# every refreshable file with a hash of what was written, in files-<build>.json - named
# for its build, so no cache can hand out an old one under its name - and
# deployment.json, the few bytes every page load asks for: the build, and
# which list is its. The build id is a hash of all the files' hashes, so a
# rebuild that changes nothing refreshable changes nothing for visitors. Lists from
# earlier builds are taken out of the output. Not written for a broken build.
# See docs/cache-bust.md.

DEPLOYMENT=$(cat <<'EOF'
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [out, built, commit] = process.argv.slice(1);
// Keep this limit and the APK rule in js/cache-bust.js in step.
const MAX_REFRESH_BYTES = 2 * 1024 * 1024;
// Development only: never refreshed as part of a build.
const NOT_LISTED = new Set(['js/cache-bust.js']);
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
const rels = fs.readFileSync(0, 'utf8').split('\0').filter(Boolean)
    .map((r) => r.replace(/^\.\//, ''))
    .filter((rel) => !/\.apk$/i.test(rel) && !NOT_LISTED.has(rel) && fs.statSync(path.join(out, rel)).size <= MAX_REFRESH_BYTES)
    .sort();
const files = {};
for (const rel of rels) files[rel] = hash(fs.readFileSync(path.join(out, rel)));
const build = hash(rels.map((rel) => `${rel} ${files[rel]}\n`).join(''));
const list = `files-${build}.json`;
for (const old of fs.readdirSync(out)) if (/^files-[0-9a-f]+\.json$/.test(old) && old !== list) fs.unlinkSync(path.join(out, old));
fs.writeFileSync(path.join(out, list), JSON.stringify({ build, files }));
fs.writeFileSync(path.join(out, 'deployment.json'), JSON.stringify({ build, built, commit, files: list }));
console.log(build);
EOF
)

if [[ $BROKEN -eq 0 ]]; then
    COMMIT=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)
    # Built from uncommitted changes to the input: said so, so a report
    # naming this build can't be mistaken for the commit alone.
    if [[ -n "$COMMIT" && -n "$(git -C "$REPO" status --porcelain -- "$WEB_ABS" 2>/dev/null)" ]]; then COMMIT="$COMMIT+changes"; fi
    BUILD=$(printf '%s\0' "${FILES[@]}" | node -e "$DEPLOYMENT" "$OUTPUT_ABS/web" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$COMMIT") \
        || exitWithError "Couldn't write deployment.json"
    [[ -n "$QUIET" ]] || showInfo "- Deployment : build $BUILD${COMMIT:+ ($COMMIT)} -> web/deployment.json, web/files-$BUILD.json"
fi

#-------------------------------------------------------------------------------
# Summary

size() { du -sb --exclude='*.gz' "$1" | cut -f1; }
OUT_SIZE=$(size "$OUTPUT_ABS")
human() { numfmt --to=iec --suffix=B "$1"; }
echo
echo "${GREEN}${BOLD}Done:${RESET} $TOTAL files, $(human "$IN_SIZE") -> $(human "$OUT_SIZE") ($(( (IN_SIZE - OUT_SIZE) * 100 / (IN_SIZE > 0 ? IN_SIZE : 1) ))% smaller)"
[[ $WARNINGS -eq 0 ]] || showWarning "$WARNINGS file(s) copied unminified - see above"
[[ $BROKEN -eq 0 ]] || exitWithError "$BROKEN script(s) broken by minifying - don't deploy this"
exit 0
