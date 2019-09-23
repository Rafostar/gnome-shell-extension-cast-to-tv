var scanner = require('multicast-scanner');
var gnome = require('../gnome');

scanner({ full_scan: true }, (err, devices) =>
{
	if(err) devices = [];
	else devices.forEach(device => delete device.ip);

	gnome.setSetting('chromecast-devices', JSON.stringify(devices));
});
