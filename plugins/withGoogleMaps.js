const { withInfoPlist } = require('@expo/config-plugins');

const withGoogleMaps = (config, { googleMapsApiKey } = {}) => {
  return withInfoPlist(config, (config) => {
    if (googleMapsApiKey) {
      config.modResults.GMSApiKey = googleMapsApiKey;
    }
    return config;
  });
};

module.exports = withGoogleMaps;
