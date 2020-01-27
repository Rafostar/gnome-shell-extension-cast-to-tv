const scanner = require('multicast-scanner');
const gnome = require('../gnome');

scanner({ full_scan: true }, (err, devices) =>
{
	if(err) devices = [];
	else devices.forEach(device => device.ip = '');

	gnome.setSetting('chromecast-devices', JSON.stringify(devices));
});
