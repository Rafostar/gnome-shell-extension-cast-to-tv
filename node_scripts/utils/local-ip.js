var internalIp = require('internal-ip').v4;
var ip = internalIp.sync();
if(ip) console.log(ip);
