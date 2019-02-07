var websocket = io();

if(typeof player !== 'undefined') player.on('ended', () => { websocket.emit('track-ended'); });
websocket.on('reload', () => { location.reload(true); });
