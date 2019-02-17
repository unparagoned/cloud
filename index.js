const is = require('is');
const got = require('got');
const randomize = require('randomatic');
const sortObject = require('sort-keys-recursive');
const md5 = require('md5');
const delay = require('delay');
const debug = require('debug')('@tuyapi/cloud');
const request = require('request');
// Error object
class TuyaCloudRequestError extends Error {
  constructor(options) {
    super();
    this.code = options.code;
    this.message = options.message;
  }
}

/**
* A TuyaCloud object
* @class
* @param {Object} options construction options
* @param {String} options.key API key
* @param {String} options.secret API secret
* @param {String} [options.region='AZ'] region (AZ=Americas, AY=Asia, EU=Europe)
* @param {String} [options.deviceID] ID of device calling API (defaults to a random value)
* @param {String} [options.mode='ANY'] Authorisation method (ANY, KEY, EMAIL)
* @param {String} options.userName App email to login to App on phone
* @param {String} options.password App password
* @param {String} [options.bizType='smart_life'] App business ('tuya' or 'smart_life')
* @param {String} [options.countryCode='44'] Country code (International dialing number)
* @example
* const api = new Cloud({key: 'your-api-key', secret: 'your-api-secret'})
*/
function TuyaCloud(options) {
  // Set to empty object if undefined
  options = is.undefined(options) ? {} : options;

  // Use app object for email/pass registered through phone app.
  // email/pass registered through cloud may be different.
  this.app = {};
  this.mode = is.undefined(options.mode) ? 'ANY' : options.mode;

  // Key and secret | email pass
  if (!options.key || !options.secret
      || options.key.length !== 20 || options.secret.length !== 32) {
    if (this.mode === 'KEY') throw new Error('Missing or invalid key/sectret');
    if (this.mode === 'ANY') this.mode = 'EMAIL';
    else debug('Invalid format for key or secret.');
  } else {
    this.key = options.key;
    this.secret = options.secret;
  }

  if (!options.userName || !options.password) {
    if (this.mode === 'EMAIL') throw new Error('Missing or invalid key/sectret and email/pass');
    if (this.mode === 'ANY') this.mode = 'KEY';
  } else {
    this.app = {
      userName: options.userName,
      password: options.password,
      countryCode: options.countryCode,
      bizType: options.bizType,
      from: 'tuya',
    };
  }
  // Device ID
  if (is.undefined(options.deviceID)) {
    this.deviceID = randomize('a0', 44, options);
  } else {
    this.deviceID = options.deviceID;
  }
  debug(`What is region: ${options.region} and this ${this.region}`);
  // Region
  if (is.undefined(options.region) || options.region === 'AZ') {
    this.region = 'AZ';
    this.endpoint = 'https://a1.tuyaus.com/api.json';
  } else if (options.region === 'AY') {
    this.region = 'AY';
    this.endpoint = 'https://a1.tuyacn.com/api.json';
  } else if (options.region === 'EU') {
    this.region = 'EU';
    this.endpoint = 'https://a1.tuyaeu.com/api.json';
  } else {
    throw new Error('Bad region identifier.');
  }


  // Specific endpoint where no key/secret required
  if (is.undefined(options.region) || options.region === 'AZ') {
    this.region = 'AZ';
    this.uriroot = 'https://px1.tuyaeu.com/homeassistant';
  } else if (options.region === 'AY') {
    this.region = 'AY';
    this.uriroot = 'https://px1.tuyaeu.com/homeassistant';
  } else if (options.region === 'EU') {
    this.region = 'EU';
    this.uriroot = 'https://px1.tuyaeu.com/homeassistant';
    debug(`correct if ${this.uriroot}`);
  } else {
    throw new Error('Bad region identifier.');
  }
}
debug(`post set region root ${this.uriroot} or regioin ${this.region}`);
/**
* Slices and dices an MD5 digest
* to conform to Tuya's spec.
* Don't ask why this is needed.
* @param {String} data to hash
* @returns {String} resulting digest
* @private
*/
TuyaCloud.prototype._mobileHash = function (data) {
  const preHash = md5(data);

  return preHash.slice(8, 16)
         + preHash.slice(0, 8)
         + preHash.slice(24, 32)
         + preHash.slice(16, 24);
};

/**
* Sends an API request
* @param {Object} options
* request options
* @param {String} options.action
* API action to invoke (for example, 'tuya.cloud.device.token.create')
* @param {Object} [options.data={}]
* data to send in the request body
* @param {Boolean} [options.requiresSID=true]
* set to false if the request doesn't require a session ID
* @example
* // generate a new token
* api.request({action: 'tuya.m.device.token.create',
*              data: {'timeZone': '-05:00'}}).then(token => console.log(token))
* @returns {Promise<Object>} A Promise that contains the response body parsed as JSON
*/
TuyaCloud.prototype.request = async function (options) {
  // Set to empty object if undefined
  options = is.undefined(options) ? {} : options;

  // Check arguments
  if (is.undefined(options.requiresSID)) {
    options.requiresSID = true;
  }

  if (!options.action) {
    throw new Error('Must specify an action to call.');
  }

  if (!options.data) {
    options.data = {};
  }

  // Must have SID if we need it later
  if (!this.sid && options.requiresSID) {
    throw new Error('Must call login() first.');
  }

  const d = new Date();
  const pairs = {
    a: options.action,
    deviceId: this.deviceID,
    os: 'Linux',
    lang: 'en',
    v: '1.0',
    clientId: this.key,
    time: Math.round(d.getTime() / 1000),
    postData: JSON.stringify(options.data),
  };

  if (options.requiresSID) {
    pairs.sid = this.sid;
  }

  // Generate signature for request
  const valuesToSign = ['a', 'v', 'lat', 'lon', 'lang', 'deviceId', 'imei',
    'imsi', 'appVersion', 'ttid', 'isH5', 'h5Token', 'os',
    'clientId', 'postData', 'time', 'n4h5', 'sid', 'sp'];

  const sortedPairs = sortObject(pairs);

  let strToSign = '';

  // Create string to sign
  for (const key in sortedPairs) {
    if (!valuesToSign.includes(key) || is.empty(pairs[key])) {
      continue;
    } else if (key === 'postData') {
      strToSign += key;
      strToSign += '=';
      strToSign += this._mobileHash(pairs[key]);
      strToSign += '||';
    } else {
      strToSign += key;
      strToSign += '=';
      strToSign += pairs[key];
      strToSign += '||';
    }
  }

  // Add secret
  strToSign += this.secret;

  // Sign string
  pairs.sign = md5(strToSign);

  try {
    debug('Sending parameters:');
    debug(pairs);

    const apiResult = await got(this.endpoint, { query: pairs });
    const data = JSON.parse(apiResult.body);

    debug('Received response:');
    debug(apiResult.body);

    if (data.success === false) {
      throw new TuyaCloudRequestError({ code: data.errorCode, message: data.errorMsg });
    }

    return data.result;
  } catch (err) {
    throw err;
  }
};

/**
* Gets Access Token from using only Tuya/Smart Life App email and pass
* @param {Object} options
* register options
* @param {String} options.userName
* email to register
* @param {String} options.password
* password for new user
* @param {String} [options.bizType='smart_life']
* Generic bizType ('tuya' or 'smart_life')
* @param {String} [options.countryCode='44']
* International dialling code UK default '44'
* @example
* api.getAppToken({ userName: 'example@example.com',
                    password: 'example-password',
                    bizType: 'smart_life',
                    countryCode: '44'})
                .then(tokenDetails => console.log('Token Details: ', tokenDetails))
* @returns {Promise<String>} A Promise that contains token details
*/
TuyaCloud.prototype.getAppToken = async options => new Promise(async (resolve, reject) => {
  // Requests seems to format the data in a way that tuyapi likes
  try {
    request.post({ url: options.uri, form: options.data },
      (err, response, body) => {
        let tokenJSON;
        if (!err && response.statusCode == 200) {
          debug(body);
          tokenJSON = JSON.parse(body);
          resolve(tokenJSON);
        }
        if (err && !tokenJSON
                && tokenJSON.expires_in > 8600
                && tokenJSON.access_token.length > 10) {
          debug(`Warning: Your token was resolved while ignored ERROR: ${err} `);
          resolve(tokenJSON);
        } else if (err) reject(err);
      });
  } catch (error) {
    reject(error);
    throw new Error(`Error logging in and getting token. The check you are using the email and password \
  you use to log into to the Tuya or Smart_Life apps: ${error}`);
  }
}).then((value) => { this.tokenCredentials = value; debug(`resolving tokens ${value}`); return Promise.resolve(value); })
  .catch(reason => debug(reason));
/*
    const apiResult = await this.request({
      action: 'tuya.m.user.email.register',
      data: {
        countryCode: this.region,
        email: options.email,
        passwd: md5(options.password),
      },
      requiresSID: false,
    });

    this.sid = apiResult.sid;
    return this.sid;
  } catch (err) {
    if (err.code === 'USER_NAME_IS_EXIST') {
      return this.login(options);
    }

    throw err;
  } */


/**
* Helper to log in a user.
* @param {Object} options
* register options
* @param {String} options.email
* user's email
* @param {String} options.password
* user's password
* @example
* api.login({email: 'example@example.com',
             password: 'example-password'}).then(sid => console.log('Session ID: ', sid))
* @returns {Promise<String>} A Promise that contains the session ID
*/
TuyaCloud.prototype.login = async function (options) {
  try {
    const apiResult = await this.request({
      action: 'tuya.m.user.email.password.login',
      data: {
        countryCode: this.region,
        email: options.email,
        passwd: md5(options.password),
      },
      requiresSID: false,
    });
    this.sid = apiResult.sid;
    return this.sid;
  } catch (err) {
    throw err;
  }
};


/**
* Helper to log in a user.
* @param {Object} options
* register options
* @param {String} options.email
* user's email
* @param {String} options.password
* user's password
* @example
* api.login({email: 'example@example.com',
             password: 'example-password'}).then(sid => console.log('Session ID: ', sid))
* @returns {Promise<String>} A Promise that contains the session ID
*/
TuyaCloud.prototype.login = async function (options) {
  try {
    const apiResult = await this.request({
      action: 'tuya.m.user.email.password.login',
      data: {
        countryCode: this.region,
        email: options.email,
        passwd: md5(options.password),
      },
      requiresSID: false,
    });
    this.sid = apiResult.sid;
    return this.sid;
  } catch (err) {
    throw err;
  }
};

/**
* Helper to wait for device(s) to be registered.
* It's possible to register multiple devices at once,
* so this returns an array.
* @param {Object} options
* options
* @param {String} options.token
* token being registered
* @param {Number} [options.devices=1]
* number of devices to wait for
* @example
* api.waitForToken({token: token.token}).then(result => {
*   let device = result[0];
*   console.log('Params:');
*   console.log(JSON.stringify({id: device['id'], localKey: device['localKey']}));
* });
* @returns {Promise<Array>} A Promise that contains an array of registered devices
*/
TuyaCloud.prototype.waitForToken = function (options) {
  if (!options.devices) {
    options.devices = 1;
  }

  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < 200; i++) {
      try {
        /* eslint-disable-next-line no-await-in-loop */
        const tokenResult = await this.request({
          action: 'tuya.m.device.list.token',
          data: { token: options.token },
        });

        if (tokenResult.length >= options.devices) {
          return resolve(tokenResult);
        }

        // Wait for 200 ms
        /* eslint-disable-next-line no-await-in-loop */
        await delay(200);
      } catch (err) {
        reject(err);
      }
    }
    reject(new Error('Timed out wating for device(s) to connect to cloud'));
  });
};

module.exports = TuyaCloud;
