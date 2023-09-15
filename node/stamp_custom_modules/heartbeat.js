const {exec} = require("child_process");

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 

const ledpin = 0; 

async function ledsetup(){
	exec('echo '+ledpin.toString()+' > /sys/class/gpio/export', (error,stdout,stderr) => {
		if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 
	 exec('echo out > /sys/class/gpio/gpio'+ledpin.toString()+'/direction', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 
}

async function ledbeat(){
	exec('echo 1 > /sys/class/gpio/gpio'+ledpin.toString()+'/value', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 await delay(50);
	 
	 
	exec('echo 0 > /sys/class/gpio/gpio'+ledpin.toString()+'/value', (error,stdout,stderr) => {
		 if (error) {
			console.error(`exec error: ${error}`);
			return;
			}
		console.log(`${stdout}`);
		if (stderr != "")
			console.error(`stderr: ${stderr}`);
	 });
	 
}


async function ledremove(){
	exec('echo '+ledpin.toString()+' > /sys/class/gpio/unexport', (error,stdout,stderr) => {});
}

ledsetup();




module.exports = {ledsetup,ledremove,ledbeat}