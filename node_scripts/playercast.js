const debug = require('debug')('playercast');
const scanner = require('multicast-scanner');
const internalIp = require('internal-ip').v4;
const bridge = require('./bridge');
const socket = require('./server-socket');
const sender = require('./sender');
const events = require('./events');

var connectTimeout;

exports.cast = function()
{
	var recName = null;

	if(
		bridge.config.playercastName
		&& socket.playercasts.includes(bridge.config.playercastName)
	) {
		recName = bridge.config.playercastName;
		debug(`Cast to connected playercast: ${recName}`);
	}

	if(!bridge.config.playercastName && socket.playercasts.length)
	{
		recName = socket.playercasts[0];
		debug(`Cast to first playercast: ${recName}`);
	}

	if(recName)
		return emitCast(recName);

	recName = bridge.config.playercastName || null;
	debug(`Searching for ${recName || 'any Playercast'}...`);

	findReceiver(recName, (err, device) =>
	{
		if(err) return debug(err);

		debug('Playercast found');
		connectClient(device);
	});
}

function emitCast(receiverName)
{
	socket.emit('playercast', {
		name: receiverName,
		mediaData: bridge.mediaData,
		...bridge.selection
	});
}

function findReceiver(receiverName, cb)
{
	const fullName = (receiverName)
		? (receiverName.split(' ').join('') + '.').toLowerCase()
		: null;

	const opts = {
		name: fullName,
		friendly_name: receiverName,
		service_name: '_playercast._tcp.local',
		service_type: 'PTR'
	};

	scanner(opts, cb);
}

function connectClient(device)
{
	const reqOpts = {
		hostname: device.ip,
		port: device.port || 9881
	};

	debug('Checking sender IP...');

	internalIp().then(address =>
	{
		if(!address)
			return debug(new Error('Local IP undetected'));

		debug(`Sender IP: ${address}`);

		const reqData = {
			hostname: address,
			port: bridge.config.listeningPort
		};

		debug('Sending connection request...');
		sender.sendPlayercastRequest(reqOpts, reqData, (err) =>
		{
			if(err) return debug(err);

			debug('Send connection request');

			events.on('playercast-added', onPlayercastAdded);
			setConnectTimeout();
		});
	});
}

function setConnectTimeout()
{
	if(connectTimeout) return;

	connectTimeout = setTimeout(() =>
	{
		connectTimeout = null;

		debug('Playercast connection timeout');
		events.removeListener('playercast-added', onPlayercastAdded);
	}, 7000);

	debug('Started connection timeout');
}

function clearConnectTimeout()
{
	if(!connectTimeout) return;

	clearTimeout(connectTimeout);
	connectTimeout = null;

	debug('Removed connection timeout');
}

function onPlayercastAdded(addedName)
{
	debug('New Playercast added');

	if(
		bridge.config.playercastName
		&& addedName !== bridge.config.playercastName
	) {
		return debug('Playercast name mismatch');
	}

	clearConnectTimeout();
	events.removeListener('playercast-added', onPlayercastAdded);

	emitCast(addedName);
}
