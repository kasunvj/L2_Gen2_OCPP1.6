const {SerialPort} = require('serialport');
const port = new SerialPort({ path: '/dev/ttyS2', baudRate: 115200}); 
var totalBufOut = Buffer.from([0x5A,0xA5,0x07,0x82,0x00,0x84,0x5A,0x01,0x00]);

port.write(totalBufOut, function(err) {
			if (err) {
				return console.log('Error on write: ', err.message)
				} 
				console.log(totalBufOut);
			});
		