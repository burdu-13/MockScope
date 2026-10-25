import { generateMockJwt } from './auth-mock';
import {
  datasetProvider,
  UUID_POOL,
  USERNAMES,
  DEPARTMENTS,
  RELATIONSHIPS,
  PERSONAL_NUMBERS,
  LANGUAGES,
  THEMES,
  CURRENCIES,
  CURRENCY_SYMBOLS,
  BIC_SWIFT_POOL,
  CARD_NUMBERS,
  EXPIRY_DATES,
  CVV_CODES,
  LOAN_PURPOSES,
  LOAN_STATUS_NAMES,
  buildCardSvgDataUri,
  SKU_CODES,
  TRACKING_NUMBERS,
  COUPON_CODES,
  TAG_LABELS,
  REVIEW_COMMENTS,
  REGIONS,
  COUNTRY_CODES,
  POSTAL_CODES,
  LATITUDES,
  LONGITUDES,
  TIMEZONES,
  MONTHS_SHORT,
  CHART_COLORS,
  ISO_TIMESTAMPS,
  BIRTHDAYS,
  WIDGET_SUBTITLES,
  IPV4_ADDRESSES,
  SEMVER_VERSIONS,
  NOTIFICATION_MESSAGES,
} from './datasets/index';

export function synthesizeStringValue(
  fieldName: string = 'text',
  itemIndex: number = 0,
  enclosingTypeName?: string
): string {
  const lower = fieldName.toLowerCase();
  const enclosingLower = (enclosingTypeName || '').toLowerCase();

  if (lower === 'tokentype' || lower === 'token_type') {
    return 'Bearer';
  }
  if (lower === 'refreshtoken' || lower === 'refresh_token') {
    return 'rt_refresh_token_dev_1';
  }
  if (
    lower.includes('token') ||
    lower.includes('secret') ||
    lower === 'jwt' ||
    lower === 'accesstoken' ||
    lower === 'access_token' ||
    lower === 'idtoken' ||
    lower === 'id_token'
  ) {
    return generateMockJwt();
  }
  if (lower.includes('uuid')) {
    return UUID_POOL[itemIndex % UUID_POOL.length]!;
  }
  if (lower.includes('iban') || lower.includes('accountnumber') || lower.includes('account_number')) {
    return datasetProvider.getIban(itemIndex);
  }
  if (lower === 'bic' || lower === 'swift' || lower === 'swiftcode' || lower === 'bankcode') {
    return BIC_SWIFT_POOL[itemIndex % BIC_SWIFT_POOL.length]!;
  }
  if (lower === 'cardnumber' || lower === 'card_number' || lower === 'pan') {
    return CARD_NUMBERS[itemIndex % CARD_NUMBERS.length]!;
  }
  if (lower === 'expirydate' || lower === 'expiry_date' || lower === 'expdate' || lower === 'expirationdate') {
    return EXPIRY_DATES[itemIndex % EXPIRY_DATES.length]!;
  }
  if (lower === 'cvv' || lower === 'cvc' || lower === 'securitycode') {
    return CVV_CODES[itemIndex % CVV_CODES.length]!;
  }
  if (lower.includes('base64')) {
    return buildCardSvgDataUri(itemIndex);
  }
  if (
    lower === 'currency' ||
    lower === 'basecurrency' ||
    lower === 'base_currency' ||
    lower === 'base' ||
    lower === 'from' ||
    lower === 'to' ||
    lower === 'receiveraccountcurrency'
  ) {
    return CURRENCIES[itemIndex % 3]!;
  }
  if (lower === 'symbol' || lower === 'currencysymbol') {
    return CURRENCY_SYMBOLS[itemIndex % 3]!;
  }
  if (lower === 'language' || lower === 'lang' || lower === 'locale') {
    return LANGUAGES[itemIndex % LANGUAGES.length]!;
  }
  if (lower === 'theme' || lower === 'colormode') {
    return THEMES[itemIndex % THEMES.length]!;
  }
  if (lower === 'timezone' || lower === 'tz') {
    return TIMEZONES[itemIndex % TIMEZONES.length]!;
  }
  if (lower === 'month' || lower === 'billperiod') {
    return MONTHS_SHORT[itemIndex % MONTHS_SHORT.length]!;
  }
  if (lower.includes('color') || lower === 'bg' || lower === 'fill' || lower === 'stroke') {
    return CHART_COLORS[itemIndex % CHART_COLORS.length]!;
  }
  if (lower === 'street' || lower === 'address' || lower === 'addressline1') {
    return datasetProvider.getStreet(itemIndex);
  }
  if (lower === 'city') {
    return datasetProvider.getCity(itemIndex);
  }
  if (lower === 'region' || lower === 'state' || lower === 'province') {
    return REGIONS[itemIndex % REGIONS.length]!;
  }
  if (lower === 'country') {
    return datasetProvider.getCountry(itemIndex);
  }
  if (lower === 'countrycode' || lower === 'country_code') {
    return COUNTRY_CODES[itemIndex % COUNTRY_CODES.length]!;
  }
  if (lower === 'postalcode' || lower === 'postal_code' || lower === 'zipcode' || lower === 'zip') {
    return POSTAL_CODES[itemIndex % POSTAL_CODES.length]!;
  }
  if (lower === 'relationship') {
    return RELATIONSHIPS[itemIndex % RELATIONSHIPS.length]!;
  }
  if (lower === 'personalnumber' || lower === 'personal_number' || lower === 'nationalid' || lower === 'ssn') {
    return PERSONAL_NUMBERS[itemIndex % PERSONAL_NUMBERS.length]!;
  }
  if (lower === 'company' || lower === 'companyname' || lower === 'organization') {
    return datasetProvider.getCompany(itemIndex);
  }
  if (lower === 'department') {
    return DEPARTMENTS[itemIndex % DEPARTMENTS.length]!;
  }
  if (lower === 'brand' || lower === 'manufacturer') {
    return datasetProvider.getBrandName(itemIndex);
  }
  if (lower === 'sku' || lower === 'barcode') {
    return SKU_CODES[itemIndex % SKU_CODES.length]!;
  }
  if (lower === 'trackingnumber' || lower === 'tracking_number') {
    return TRACKING_NUMBERS[itemIndex % TRACKING_NUMBERS.length]!;
  }
  if (lower === 'coupon' || lower === 'couponcode' || lower === 'promocode') {
    return COUPON_CODES[itemIndex % COUPON_CODES.length]!;
  }
  if (lower === 'tag' || lower === 'badge') {
    return TAG_LABELS[itemIndex % TAG_LABELS.length]!;
  }
  if (lower === 'comment' || lower === 'review' || lower === 'feedback') {
    return REVIEW_COMMENTS[itemIndex % REVIEW_COMMENTS.length]!;
  }
  if (lower === 'merchant' || lower === 'merchantname' || lower === 'vendor') {
    return datasetProvider.getMerchantName(itemIndex);
  }
  if (lower === 'ip' || lower === 'ipaddress' || lower === 'ipv4') {
    return IPV4_ADDRESSES[itemIndex % IPV4_ADDRESSES.length]!;
  }
  if (lower === 'version' || lower === 'appversion') {
    return SEMVER_VERSIONS[itemIndex % SEMVER_VERSIONS.length]!;
  }
  if (lower.includes('email')) {
    return datasetProvider.getEmail(itemIndex);
  }
  if (lower === 'birthday' || lower === 'birthdate' || lower === 'dateofbirth' || lower === 'dob') {
    return BIRTHDAYS[itemIndex % BIRTHDAYS.length]!;
  }
  if (
    lower.includes('date') ||
    lower.endsWith('at') ||
    lower === 'timestamp' ||
    lower === 'lastupdated' ||
    lower === 'newenddate'
  ) {
    return ISO_TIMESTAMPS[itemIndex % ISO_TIMESTAMPS.length]!;
  }
  if (lower.includes('poster') || lower.includes('backdrop') || lower.includes('banner')) {
    return '/sample_asset.jpg';
  }
  if (lower === 'subtitle' || lower === 'subtext') {
    return WIDGET_SUBTITLES[itemIndex % WIDGET_SUBTITLES.length]!;
  }
  if (lower.includes('overview') || lower.includes('description') || lower.includes('bio')) {
    if (itemIndex === 0) {
      return `Sample description for ${fieldName}.`;
    }
    return datasetProvider.getTransactionDescription(itemIndex);
  }
  if (lower.includes('url') || lower.includes('avatar') || lower.includes('image') || lower.includes('icon')) {
    return 'https://images.unsplash.com/photo-example';
  }
  if (lower.includes('phone') || lower.includes('mobile')) {
    return datasetProvider.getPhone(itemIndex);
  }
  if (lower.includes('title')) {
    return `Sample ${fieldName}`;
  }
  if (lower.includes('username')) {
    return itemIndex === 0 ? 'devuser' : USERNAMES[itemIndex % USERNAMES.length]!;
  }
  if (lower === 'firstname' || lower === 'first_name') {
    return datasetProvider.getFirstName(itemIndex);
  }
  if (lower === 'lastname' || lower === 'last_name') {
    return datasetProvider.getLastName(itemIndex);
  }
  if (lower === 'cardname' || lower === 'card_name' || lower === 'design') {
    return datasetProvider.getCardName(itemIndex);
  }
  if (lower === 'friendlyname' || lower === 'friendly_name' || lower === 'accountname' || lower === 'favoritename') {
    return datasetProvider.getAccountName(itemIndex);
  }
  if (lower === 'servicename' || lower === 'service_name') {
    return datasetProvider.getServiceName(itemIndex);
  }
  if (lower === 'purpose' || lower === 'displaytext' || lower === 'prepaymentdisplayname') {
    return LOAN_PURPOSES[itemIndex % LOAN_PURPOSES.length]!;
  }
  if (lower === 'prepaymentvalue') {
    return itemIndex % 2 === 0 ? 'reduce_monthly_payment' : 'reduce_loan_term';
  }
  if (lower === 'statusname' || lower === 'status_name') {
    return LOAN_STATUS_NAMES[itemIndex % LOAN_STATUS_NAMES.length]!;
  }
  if (lower === 'categoryname' || lower === 'category_name' || lower === 'category') {
    return datasetProvider.getCategoryName(itemIndex);
  }
  if (
    lower === 'fullname' ||
    lower === 'full_name' ||
    lower === 'cardholdername' ||
    lower === 'accountholder' ||
    lower === 'receivername' ||
    lower === 'sendername'
  ) {
    return datasetProvider.getFullName(itemIndex);
  }
  if (lower === 'productname' || lower === 'product_name' || lower === 'itemname') {
    return datasetProvider.getProductName(itemIndex);
  }
  if (lower === 'name') {
    if (enclosingLower.includes('category') || enclosingLower.includes('catalog')) {
      return datasetProvider.getCategoryName(itemIndex);
    }
    if (enclosingLower.includes('provider') || enclosingLower.includes('service')) {
      return datasetProvider.getServiceName(itemIndex);
    }
    if (enclosingLower.includes('card')) {
      return datasetProvider.getCardName(itemIndex);
    }
    if (enclosingLower.includes('account') && !enclosingLower.includes('useraccount')) {
      return datasetProvider.getAccountName(itemIndex);
    }
    if (enclosingLower.includes('loan')) {
      return LOAN_PURPOSES[itemIndex % LOAN_PURPOSES.length]!;
    }
    if (enclosingLower.includes('product') || enclosingLower.includes('item') || enclosingLower.includes('merch')) {
      return datasetProvider.getProductName(itemIndex);
    }
    if (enclosingLower.includes('company') || enclosingLower.includes('org')) {
      return datasetProvider.getCompany(itemIndex);
    }
    return datasetProvider.getFullName(itemIndex);
  }
  if (lower === 'label') {
    return `Option ${itemIndex + 1}`;
  }
  if (lower === 'type' && (enclosingLower.includes('field') || enclosingLower.includes('input') || enclosingLower.includes('form'))) {
    return 'text';
  }
  if (lower === 'transfertype' || lower === 'transfer_type') {
    return 'INTERNAL';
  }
  if (lower.includes('accountstatus') || lower.includes('userstatus')) {
    return 'active';
  }
  if (lower === 'status' || lower === 'loginstatus') {
    if (enclosingLower.includes('account') || enclosingLower.includes('card')) {
      return 'ACTIVE';
    }
    return 'success';
  }
  if (lower.includes('status')) {
    return 'active';
  }
  if (lower.includes('message')) {
    return itemIndex === 0
      ? 'Operation completed successfully'
      : NOTIFICATION_MESSAGES[itemIndex % NOTIFICATION_MESSAGES.length]!;
  }
  if (lower === 'code' || lower.includes('statuscode') || lower.includes('errcode')) {
    if (enclosingLower.includes('exchange') || enclosingLower.includes('rate') || enclosingLower.includes('currency')) {
      return CURRENCIES[itemIndex % 3]!;
    }
    return itemIndex > 0 ? CURRENCIES[itemIndex % 3]! : 'SUCCESS';
  }
  if (lower === 'challengeid' || lower === 'challenge_id') {
    return 'ch_challenge_dev_1';
  }
  if (lower === 'method') {
    return 'totp';
  }
  if (lower === 'reason') {
    return 'verification_required';
  }
  if (lower.includes('maskedphone') || lower.includes('masked_phone')) {
    return '+1 (***) ***-2834';
  }
  if (lower === 'role' || lower === 'roles') {
    return 'admin';
  }
  if (lower === 'permission' || lower === 'permissions') {
    return 'read';
  }
  if (lower.includes('cursor')) {
    return '';
  }
  if (lower.includes('id') && !lower.includes('valid') && !lower.includes('paid') && !lower.includes('width')) {
    return `id_${1001 + (itemIndex % 3)}`;
  }

  return `sample_${fieldName}`;
}

export function synthesizeNumberValue(
  fieldName: string = 'amount',
  itemIndex: number = 0,
  enclosingTypeName?: string
): number {
  const lower = fieldName.toLowerCase();
  const enclosingLower = (enclosingTypeName || '').toLowerCase();

  if (
    lower.endsWith('ms') ||
    lower.includes('timeout') ||
    lower.includes('interval') ||
    lower.includes('delay')
  ) {
    return 60000;
  }
  if (lower.includes('minute')) {
    return 5;
  }
  if (lower.includes('attempt') || lower.includes('retr')) {
    return 3;
  }
  if (lower === 'order' || lower === 'index' || lower === 'position' || lower === 'priority' || lower === 'day') {
    return itemIndex + 1;
  }
  if (lower === 'latitude' || lower === 'lat') {
    return LATITUDES[itemIndex % LATITUDES.length]!;
  }
  if (lower === 'longitude' || lower === 'lng' || lower === 'lon') {
    return LONGITUDES[itemIndex % LONGITUDES.length]!;
  }
  if (lower === 'months' || lower === 'period' || lower === 'remainingpayments') {
    const terms = [12, 24, 36, 48];
    return terms[itemIndex % terms.length]!;
  }
  if (
    lower.includes('expires_in') ||
    lower.includes('expiresin') ||
    lower === 'ttl' ||
    lower.includes('expiry')
  ) {
    return 86400; // 24 hours
  }
  if (
    lower === 'exp' ||
    lower.includes('expires_at') ||
    lower.includes('expiresat')
  ) {
    return Math.floor(Date.now() / 1000) + 31536000; // 1 year future epoch
  }
  if (lower.includes('statuscode') || lower.includes('status_code')) {
    return 200;
  }
  if (lower === 'status') {
    if (enclosingLower) {
      return (itemIndex % 3) + 1;
    }
    return 200;
  }
  if (lower.includes('vote')) {
    return 8.4;
  }
  if (lower.includes('rating') || lower.includes('score')) {
    const ratings = [4.8, 4.9, 4.7, 4.6, 5.0];
    return ratings[itemIndex % ratings.length]!;
  }
  if (lower === 'percentage' || lower === 'savingsrate') {
    const pcts = [35, 25, 22, 18];
    return pcts[itemIndex % pcts.length]!;
  }
  if (lower === 'interestrate') {
    const rates = [8.5, 10.9, 12.4, 9.2];
    return rates[itemIndex % rates.length]!;
  }
  if (lower.includes('rate') || lower.includes('percent') || lower.includes('change')) {
    return Number((1.08 + itemIndex * 0.45).toFixed(2));
  }
  if (lower.includes('income')) {
    return 4800 + itemIndex * 650;
  }
  if (lower.includes('expense')) {
    return 2950 + itemIndex * 420;
  }
  if (lower.includes('saving')) {
    return 1850 + itemIndex * 230;
  }
  if (lower === 'minamount' || lower === 'min') {
    return 10;
  }
  if (lower === 'maxamount' || lower === 'max' || lower === 'creditlimit') {
    return 15000;
  }
  if (lower === 'monthlypayment') {
    return 320 + itemIndex * 110;
  }
  if (lower === 'loanamount' || lower === 'totalamounttopay' || lower === 'remainingbalance') {
    return 12000 + itemIndex * 4500;
  }
  if (lower.includes('balance')) {
    return 2499 + itemIndex * 1250;
  }
  if (lower.includes('price') || lower.includes('amount') || lower.includes('cost') || lower.includes('cents')) {
    return 2499 + itemIndex * 350;
  }
  if (lower.includes('count') || lower.includes('quantity') || lower.includes('total') || lower.includes('page')) {
    return 5;
  }
  if (lower === 'age' || lower.includes('userage') || (lower.endsWith('age') && !lower.includes('average') && !lower.includes('percentage') && !lower.includes('page'))) {
    const ages = [29, 34, 41, 27, 38, 31];
    return ages[itemIndex % ages.length]!;
  }
  if (lower.includes('year')) {
    return 2026;
  }
  if (lower.includes('popularity')) {
    return 42;
  }
  if (lower.includes('id')) {
    return 101 + itemIndex;
  }

  return 42;
}

export function synthesizeBooleanValue(fieldName: string = 'flag', itemIndex: number = 0): boolean {
  const lower = fieldName.toLowerCase();
  if (lower === 'hasfullwidth' || lower === 'has_full_width') {
    return itemIndex === 0;
  }
  if (
    lower.includes('hidden') ||
    lower.includes('collapsed') ||
    lower.includes('disabled') ||
    lower.includes('blocked') ||
    lower.includes('locked') ||
    lower.includes('expired') ||
    lower.includes('deleted') ||
    lower.includes('archived') ||
    lower.includes('readonly') ||
    lower.includes('loading') ||
    lower.includes('pending') ||
    lower.includes('hasnextpage') ||
    lower.includes('has_next_page') ||
    lower.includes('hasmore') ||
    lower.includes('has_more') ||
    lower.includes('inactive') ||
    lower.includes('closed') ||
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('mfa') ||
    lower.includes('twofactor') ||
    lower.includes('2fa') ||
    lower.includes('otp') ||
    lower.includes('challenge') ||
    lower.includes('verification') ||
    lower.includes('verify') ||
    lower.includes('adult')
  ) {
    return false;
  }
  if (
    lower.includes('success') ||
    lower.includes('auth') ||
    lower.includes('valid') ||
    lower.includes('active') ||
    lower.includes('verified')
  ) {
    return true;
  }
  return true;
}
