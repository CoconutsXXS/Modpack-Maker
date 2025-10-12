module.exports = {
  packagerConfig: {
    asar: false,
    icon: '/icon/icon'
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
