const FLAG_FILE_BY_CODE = Object.freeze({
  "AD": "AD_Andorra.png",
  "AE": "AE_United_Arab_Emirates.png",
  "AF": "AF_Afghanistan.png",
  "AG": "AG_Antigua_and_Barbuda.png",
  "AL": "AL_Albania.png",
  "AM": "AM_Armenia.png",
  "AO": "AO_Angola.png",
  "AQ": "AQ_Antarctica.png",
  "AR": "AR_Argentina.png",
  "AT": "AT_Austria.png",
  "AU": "AU_Australia.png",
  "AX": "AX_Aland_Islands.png",
  "AZ": "AZ_Azerbaijan.png",
  "BA": "BA_Bosnia_and_Herzegovina.png",
  "BB": "BB_Barbados.png",
  "BD": "BD_Bangladesh.png",
  "BE": "BE_Belgium.png",
  "BF": "BF_Burkina_Faso.png",
  "BG": "BG_Bulgaria.png",
  "BH": "BH_Bahrain.png",
  "BI": "BI_Burundi.png",
  "BJ": "BJ_Benin.png",
  "BN": "BN_Brunei.png",
  "BO": "BO_Bolivia.png",
  "BR": "BR_Brazil.png",
  "BS": "BS_Bahamas.png",
  "BT": "BT_Bhutan.png",
  "BW": "BW_Botswana.png",
  "BY": "BY_Belarus.png",
  "BZ": "BZ_Belize.png",
  "CA": "CA_Canada.png",
  "CD": "CD_DR_Congo.png",
  "CF": "CF_Central_African_Republic.png",
  "CG": "CG_Republic_of_the_Congo.png",
  "CH": "CH_Switzerland.png",
  "CI": "CI_Cote_d_Ivoire.png",
  "CK": "CK_Cook_Islands.png",
  "CL": "CL_Chile.png",
  "CM": "CM_Cameroon.png",
  "CN": "CN_China.png",
  "CO": "CO_Colombia.png",
  "CR": "CR_Costa_Rica.png",
  "CU": "CU_Cuba.png",
  "CV": "CV_Cabo_Verde.png",
  "CY": "CY_Cyprus.png",
  "CZ": "CZ_Czechia.png",
  "DE": "DE_Germany.png",
  "DJ": "DJ_Djibouti.png",
  "DK": "DK_Denmark.png",
  "DM": "DM_Dominica.png",
  "DO": "DO_Dominican_Republic.png",
  "DZ": "DZ_Algeria.png",
  "EC": "EC_Ecuador.png",
  "EE": "EE_Estonia.png",
  "EG": "EG_Egypt.png",
  "EH": "EH_Western_Sahara.png",
  "ER": "ER_Eritrea.png",
  "ES": "ES_Spain.png",
  "ET": "ET_Ethiopia.png",
  "FI": "FI_Finland.png",
  "FJ": "FJ_Fiji.png",
  "FM": "FM_Micronesia.png",
  "FO": "FO_Faroe_Islands.png",
  "FR": "FR_France.png",
  "GA": "GA_Gabon.png",
  "GB": "GB_United_Kingdom.png",
  "GD": "GD_Grenada.png",
  "GE": "GE_Georgia.png",
  "GF": "GF_French_Guiana.png",
  "GG": "GG_Guernsey.png",
  "GH": "GH_Ghana.png",
  "GI": "GI_Gibraltar.png",
  "GL": "GL_Greenland.png",
  "GM": "GM_Gambia.png",
  "GN": "GN_Guinea.png",
  "GQ": "GQ_Equatorial_Guinea.png",
  "GR": "GR_Greece.png",
  "GT": "GT_Guatemala.png",
  "GW": "GW_Guinea_Bissau.png",
  "GY": "GY_Guyana.png",
  "HN": "HN_Honduras.png",
  "HR": "HR_Croatia.png",
  "HT": "HT_Haiti.png",
  "HU": "HU_Hungary.png",
  "ID": "ID_Indonesia.png",
  "IE": "IE_Ireland.png",
  "IL": "IL_Israel.png",
  "IM": "IM_Isle_of_Man.png",
  "IN": "IN_India.png",
  "IQ": "IQ_Iraq.png",
  "IR": "IR_Iran.png",
  "IS": "IS_Iceland.png",
  "IT": "IT_Italy.png",
  "JE": "JE_Jersey.png",
  "JM": "JM_Jamaica.png",
  "JO": "JO_Jordan.png",
  "JP": "JP_Japan.png",
  "KE": "KE_Kenya.png",
  "KG": "KG_Kyrgyzstan.png",
  "KH": "KH_Cambodia.png",
  "KI": "KI_Kiribati.png",
  "KM": "KM_Comoros.png",
  "KN": "KN_Saint_Kitts_and_Nevis.png",
  "KP": "KP_North_Korea.png",
  "KR": "KR_South_Korea.png",
  "KW": "KW_Kuwait.png",
  "KZ": "KZ_Kazakhstan.png",
  "LA": "LA_Laos.png",
  "LB": "LB_Lebanon.png",
  "LC": "LC_Saint_Lucia.png",
  "LI": "LI_Liechtenstein.png",
  "LK": "LK_Sri_Lanka.png",
  "LR": "LR_Liberia.png",
  "LS": "LS_Lesotho.png",
  "LT": "LT_Lithuania.png",
  "LU": "LU_Luxembourg.png",
  "LV": "LV_Latvia.png",
  "LY": "LY_Libya.png",
  "MA": "MA_Morocco.png",
  "MC": "MC_Monaco.png",
  "MD": "MD_Moldova.png",
  "ME": "ME_Montenegro.png",
  "MG": "MG_Madagascar.png",
  "MH": "MH_Marshall_Islands.png",
  "MK": "MK_North_Macedonia.png",
  "ML": "ML_Mali.png",
  "MM": "MM_Myanmar.png",
  "MN": "MN_Mongolia.png",
  "MR": "MR_Mauritania.png",
  "MT": "MT_Malta.png",
  "MU": "MU_Mauritius.png",
  "MV": "MV_Maldives.png",
  "MW": "MW_Malawi.png",
  "MX": "MX_Mexico.png",
  "MY": "MY_Malaysia.png",
  "MZ": "MZ_Mozambique.png",
  "NA": "NA_Namibia.png",
  "NE": "NE_Niger.png",
  "NG": "NG_Nigeria.png",
  "NI": "NI_Nicaragua.png",
  "NL": "NL_Netherlands.png",
  "NO": "NO_Norway.png",
  "NP": "NP_Nepal.png",
  "NR": "NR_Nauru.png",
  "NU": "NU_Niue.png",
  "NZ": "NZ_New_Zealand.png",
  "OM": "OM_Oman.png",
  "PA": "PA_Panama.png",
  "PE": "PE_Peru.png",
  "PG": "PG_Papua_New_Guinea.png",
  "PH": "PH_Philippines.png",
  "PK": "PK_Pakistan.png",
  "PL": "PL_Poland.png",
  "PR": "PR_Puerto_Rico.png",
  "PS": "PS_Palestine.png",
  "PT": "PT_Portugal.png",
  "PW": "PW_Palau.png",
  "PY": "PY_Paraguay.png",
  "QA": "QA_Qatar.png",
  "RE": "RE_Reunion.png",
  "RO": "RO_Romania.png",
  "RS": "RS_Serbia.png",
  "RU": "RU_Russia.png",
  "RW": "RW_Rwanda.png",
  "SA": "SA_Saudi_Arabia.png",
  "SB": "SB_Solomon_Islands.png",
  "SC": "SC_Seychelles.png",
  "SD": "SD_Sudan.png",
  "SE": "SE_Sweden.png",
  "SG": "SG_Singapore.png",
  "SI": "SI_Slovenia.png",
  "SK": "SK_Slovakia.png",
  "SL": "SL_Sierra_Leone.png",
  "SM": "SM_San_Marino.png",
  "SN": "SN_Senegal.png",
  "SO": "SO_Somalia.png",
  "SR": "SR_Suriname.png",
  "SS": "SS_South_Sudan.png",
  "ST": "ST_Sao_Tome_and_Principe.png",
  "SV": "SV_El_Salvador.png",
  "SY": "SY_Syria.png",
  "SZ": "SZ_Eswatini.png",
  "TD": "TD_Chad.png",
  "TG": "TG_Togo.png",
  "TH": "TH_Thailand.png",
  "TJ": "TJ_Tajikistan.png",
  "TL": "TL_Timor_Leste.png",
  "TM": "TM_Turkmenistan.png",
  "TN": "TN_Tunisia.png",
  "TO": "TO_Tonga.png",
  "TR": "TR_Turkiye.png",
  "TT": "TT_Trinidad_and_Tobago.png",
  "TV": "TV_Tuvalu.png",
  "TW": "TW_Taiwan.png",
  "TZ": "TZ_Tanzania.png",
  "UA": "UA_Ukraine.png",
  "UG": "UG_Uganda.png",
  "US": "US_United_States.png",
  "UY": "UY_Uruguay.png",
  "UZ": "UZ_Uzbekistan.png",
  "VA": "VA_Vatican_City.png",
  "VC": "VC_Saint_Vincent_and_the_Grenadines.png",
  "VE": "VE_Venezuela.png",
  "VN": "VN_Vietnam.png",
  "VU": "VU_Vanuatu.png",
  "WS": "WS_Samoa.png",
  "YE": "YE_Yemen.png",
  "ZA": "ZA_South_Africa.png",
  "ZM": "ZM_Zambia.png",
  "ZW": "ZW_Zimbabwe.png",
  "KO": "KO_Kosovo.png"
});

const COUNTRY_ALIAS_OVERRIDES = Object.freeze({
  '日本': 'JP',
  '韓國': 'KR',
  '南韓': 'KR',
  '北韓': 'KP',
  '朝鮮': 'KP',
  '台灣': 'TW',
  '臺灣': 'TW',
  '美國': 'US',
  '英國': 'GB',
  '俄國': 'RU',
  '俄羅斯': 'RU',
  '澳洲': 'AU',
  '澳大利亞': 'AU',
  '紐西蘭': 'NZ',
  '新西蘭': 'NZ',
  '中國': 'CN',
  '泰國': 'TH',
  '新加坡': 'SG',
  '馬來西亞': 'MY',
  '菲律賓': 'PH',
  '印尼': 'ID',
  '印度尼西亞': 'ID',
  '越南': 'VN',
  '德國': 'DE',
  '法國': 'FR',
  '義大利': 'IT',
  '意大利': 'IT',
  '西班牙': 'ES',
  '葡萄牙': 'PT',
  '瑞士': 'CH',
  '奧地利': 'AT',
  '土耳其': 'TR',
  '加拿大': 'CA',
  '阿聯酋': 'AE',
  '阿拉伯聯合大公國': 'AE'
});

function normalizeCountryKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function englishNameFromFilename(code, filename) {
  return String(filename || '')
    .replace(new RegExp('^' + code + '_'), '')
    .replace(/\.png$/i, '')
    .replace(/_/g, ' ');
}

function addAlias(index, value, code) {
  const key = normalizeCountryKey(value);
  if (key && FLAG_FILE_BY_CODE[code]) index.set(key, code);
}

function buildCountryIndex() {
  const index = new Map();
  for (const [code, filename] of Object.entries(FLAG_FILE_BY_CODE)) {
    addAlias(index, code, code);
    addAlias(index, englishNameFromFilename(code, filename), code);
    for (const locale of ['zh-TW', 'zh-Hant', 'en']) {
      try {
        const label = new Intl.DisplayNames([locale], { type: 'region' }).of(code);
        if (label && label !== code) addAlias(index, label, code);
      } catch {}
    }
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIAS_OVERRIDES)) addAlias(index, alias, code);
  return index;
}

const COUNTRY_INDEX = buildCountryIndex();

export function countryFlagCode(country) {
  return COUNTRY_INDEX.get(normalizeCountryKey(country)) || '';
}

export function countryFlagPath(country) {
  const code = countryFlagCode(country);
  const filename = code ? FLAG_FILE_BY_CODE[code] : '';
  return filename ? './assets/flags/' + filename : '';
}

export function createCountryFlagElement(documentRef, country, {
  className = 'country-flag-icon w-9 h-9 shrink-0 flex items-center justify-center'
} = {}) {
  const wrapper = documentRef.createElement('span');
  wrapper.className = className;

  const showFallback = () => {
    wrapper.replaceChildren();
    const icon = documentRef.createElement('i');
    icon.className = 'fas fa-earth-asia text-xs';
    wrapper.appendChild(icon);
  };

  const path = countryFlagPath(country);
  if (!path) {
    showFallback();
    return wrapper;
  }

  const image = documentRef.createElement('img');
  image.src = path;
  image.alt = String(country || '').trim() ? String(country).trim() + ' 國旗' : '國旗';
  image.className = 'w-full h-full object-contain pointer-events-none select-none';
  image.loading = 'eager';
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('error', showFallback, { once: true });
  wrapper.appendChild(image);
  return wrapper;
}
