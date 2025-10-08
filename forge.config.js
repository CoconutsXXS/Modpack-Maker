module.exports = {
  packagerConfig: {
    asar: false,
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      config: {
        format: 'zip',
      },
      platforms: ['win32'],
    },
  ],

};
