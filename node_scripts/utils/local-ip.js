const internalIp = require('internal-ip').v4;
const ip = internalIp.sync();
if(ip) console.log(ip);
