var fs = require('fs');
var path = require('path');
var scanner = require('multicast-scanner');
var devicesPath = path.join(__dirname + '/../../config/devices.json');

scanner((err, devices) => {

	if(err) devices = [];
	else devices.forEach(device => {
		device.name = device.name.split('.')[0];
		delete device.ip;
	});

	fs.writeFileSync(devicesPath, JSON.stringify(devices, null, 1));
});
