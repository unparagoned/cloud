/* eslint-disable linebreak-style */
const request = require('request');
const login = require('./.credentials.json');
/** Credentials are the Tuya/Smart_Live
 * Credentials used to log into the app
 * { "email" : "email@yahoo.com",
  "pass": "password" } */
let tokenCredentials = {};
//  Country Code is your international dialiing code
const country = 44;

// Either 'tuya' or 'smart_life'. There may be others.
const biz = 'smart_life';

// Borrowed uri from tuyapy
const uri = 'https://px1.tuyaeu.com/homeassistant/auth.do';

const data = {
  userName: login.email,
  password: login.pass,
  countryCode: country,
  bizType: biz,
  from: 'tuya',
};

const settings = { uri, data };

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
            console.log(body);
            tokenJSON = JSON.parse(body);
            resolve(tokenJSON);
          }
          if (err && tokenJSON && tokenJSON.expires_in > 8600 && tokenJSON.access_token.length > 10) {
            console.log(`Your token apears to have resolved but there was an error in the process ${err}`);
            resolve(tokenJSON);
          } else if (err) reject(err);
        });
      } catch (error) {
        throw new Error(`Error logging in and getting token. The email and password \
should let you log into to the Tuya or Smart_Life apps: ${error}`);
      }
    })) { tokenCredentials = result; }
  await loginToCloud(settings, credentials);
  console.log(tokenCredentials);
}
main();
