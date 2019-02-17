const debug = require('debug')('njstuya');

const name = 'njstuya';
debug('booting %s', name);
const request = require('request');
const login = require('./keys.json');

let tokenCredentials = {};
//  Country Code is your international dialiing code
const country = '44';

// Either 'tuya' or 'smart_life'. There may be others.
const biz = 'smart_life';

// Borrowed uri from tuyapy
const uri = 'https://px1.tuyaeu.com/homeassistant/auth.do';

const data = {
  userName: login.userName,
  password: login.password,
  countryCode: country,
  bizType: biz,
  from: 'tuya',
};
const settings = { uri, data };
debug(uri);
debug(data);
async function main() {
  let credentials;
  // Requests seems to format the data in a way that tuyapi likes
  async function loginToCloud(options,
    result = new Promise((resolve, reject) => {
      try {
        request.post({
          url: options.uri,
          form: options.data,
        }, (err, httpResponse, body) => {
          let tokenJSON;
          if (!err && httpResponse) {
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
        throw new Error(`Error logging in and getting token. The check you are using the email and password \
you use to log into to the Tuya or Smart_Life apps: ${error}`);
      }
    })) { tokenCredentials = result; }
  await loginToCloud(settings, credentials);
  debug(tokenCredentials);
}
main();
