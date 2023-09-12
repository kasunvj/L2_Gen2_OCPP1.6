const {exec} = require("child_process");

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 

const resetPin = 12;

async function mcuReset(){
	 console.log("GPIO 12 Pin created as out")
	 exec('echo '+resetPin.toString()+' > /sys/class/gpio/export', (error,stdout,stderr) => {
		if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 await delay(500);
	 
	 exec('echo out > /sys/class/gpio/gpio'+resetPin.toString()+'/direction', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 await delay(1000);
	 
	 console.log("GPIO 12 Pin HIGH")
	 exec('echo 1 > /sys/class/gpio/gpio'+resetPin.toString()+'/value', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 await delay(1000);
	 
	 console.log("GPIO 12 Pin LOW")
	 exec('echo 0 > /sys/class/gpio/gpio'+resetPin.toString()+'/value', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 await delay(1000);
	 
	 exec('echo '+resetPin.toString()+' > /sys/class/gpio/unexport', (error,stdout,stderr) => {});
	 console.log("Reset Complete!!")
	
}

mcuReset()