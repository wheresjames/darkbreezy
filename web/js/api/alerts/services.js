// Where a country's official warnings are, for places Dark Breezy can't
// show them for (DARKBREEZY.md §3.2): the warnings card links here.
// Anywhere not listed gets the WMO's Severe Weather Information Centre.

const S = (name, url) => ({ name, url });

const SERVICES = {
  AR: S('Servicio Meteorológico Nacional', 'https://www.smn.gob.ar/alertas'),
  AT: S('GeoSphere Austria', 'https://warnungen.zamg.at/'),
  AU: S('Bureau of Meteorology', 'https://www.bom.gov.au/australia/warnings/'),
  BE: S('Royal Meteorological Institute', 'https://www.meteo.be/en/belgium'),
  BR: S('INMET', 'https://alertas2.inmet.gov.br/'),
  CH: S('MeteoSwiss', 'https://www.meteoswiss.admin.ch/'),
  CL: S('Dirección Meteorológica de Chile', 'https://www.meteochile.gob.cl/'),
  CN: S('China Meteorological Administration', 'https://weather.cma.cn/'),
  CZ: S('Czech Hydrometeorological Institute', 'https://www.chmi.cz/'),
  DK: S('DMI', 'https://www.dmi.dk/varsler/'),
  ES: S('AEMET', 'https://www.aemet.es/en/eltiempo/prediccion/avisos'),
  FI: S('Finnish Meteorological Institute', 'https://en.ilmatieteenlaitos.fi/warnings'),
  FR: S('Météo-France', 'https://vigilance.meteofrance.fr/'),
  GB: S('Met Office', 'https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings'),
  GR: S('Hellenic National Meteorological Service', 'https://www.emy.gr/'),
  HU: S('HungaroMet', 'https://www.met.hu/en/idojaras/veszelyjelzes/'),
  ID: S('BMKG', 'https://www.bmkg.go.id/'),
  IE: S('Met Éireann', 'https://www.met.ie/warnings'),
  IL: S('Israel Meteorological Service', 'https://ims.gov.il/en'),
  IN: S('India Meteorological Department', 'https://mausam.imd.gov.in/'),
  IS: S('Icelandic Met Office', 'https://en.vedur.is/weather/warnings/'),
  IT: S('Aeronautica Militare / Protezione Civile', 'https://www.meteoam.it/it/allerte'),
  KE: S('Kenya Meteorological Department', 'https://meteo.go.ke/'),
  KR: S('Korea Meteorological Administration', 'https://www.weather.go.kr/w/eng/'),
  MO: S('Macao Meteorological and Geophysical Bureau', 'https://www.smg.gov.mo/en'),
  MX: S('Servicio Meteorológico Nacional', 'https://smn.conagua.gob.mx/'),
  MY: S('MetMalaysia', 'https://www.met.gov.my/en/'),
  NG: S('Nigerian Meteorological Agency', 'https://nimet.gov.ng/'),
  NL: S('KNMI', 'https://www.knmi.nl/nederland-nu/weer/waarschuwingen/'),
  NO: S('MET Norway (Yr)', 'https://www.yr.no/en/extreme-weather-warnings'),
  NZ: S('MetService', 'https://www.metservice.com/warnings/home'),
  PH: S('PAGASA', 'https://www.pagasa.dost.gov.ph/'),
  PL: S('IMGW', 'https://meteo.imgw.pl/'),
  PT: S('IPMA', 'https://www.ipma.pt/en/otempo/prev-sam/'),
  RO: S('National Meteorological Administration', 'https://www.meteoromania.ro/'),
  SE: S('SMHI', 'https://www.smhi.se/en/weather/warnings-and-advisories'),
  SG: S('Meteorological Service Singapore', 'https://www.weather.gov.sg/'),
  TH: S('Thai Meteorological Department', 'https://www.tmd.go.th/en/'),
  TR: S('Turkish State Meteorological Service', 'https://www.mgm.gov.tr/'),
  TW: S('Central Weather Administration', 'https://www.cwa.gov.tw/eng/'),
  UA: S('Ukrainian Hydrometeorological Center', 'https://meteo.gov.ua/'),
  VN: S('National Center for Hydro-Meteorological Forecasting', 'https://nchmf.gov.vn/'),
  ZA: S('South African Weather Service', 'https://www.weathersa.co.za/home/warnings'),
};

const WMO = S('WMO Severe Weather Information Centre', 'https://severeweather.wmo.int/');

/** The national weather service for country [cc], or the WMO's centre. */
export function nationalService(cc) {
  return SERVICES[String(cc || '').toUpperCase()] || WMO;
}
