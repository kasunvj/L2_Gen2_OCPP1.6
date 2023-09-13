
var gpio_boot0 = 13;
var gpio_reset = 12;

var protocol_status = 0;
var packet_data_size = 200;

const {exec} = require("child_process");
const {SerialPort} = require('serialport');
const {execSync} = require('child_process');

const fs = require('fs');



var bin_name = process.argv[2];
var script_location = process.argv[1].split("/");
var bin_location = "";


// ----------------- bin location
for(let i=1; i<script_location.length-1; i=i+1) {
	bin_location = bin_location + "/" + script_location[i];
}
bin_location = bin_location + "/" + bin_name;


// -------------------- serial setup
const portS1 = new SerialPort({ path: '/dev/ttyS1', baudRate: 115200});


// ------------------------ delay
function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 


// ------------------------------ Shell exec

function shellOut(msg) {
	// console.log(msg);
	exec(msg, (error, stdout, stderr) => {
		if (error) {
			console.log('error: %s', error);
			return;
		}
		if (stderr) {
			console.log('stderr: %s', stderr);
			return;
		}
		if (stdout) {
			console.log('stdout: %s', stdout);
			return;
		}
	});

}

portS1.on("open", function() {
	console.log("------- Serial connection open ------");
	portS1.on("data", function(data) {
		serial_beging =1;
		// console.log("reading :");
		// console.log(data);
		if (data.slice(0,1).toString('hex') == 79){
			protocol_status = 1;
		}
	});
});




// -------------------- main fn

var gpio_setup_fn = 0;
var gpio_reset_fn = 0;
var boot_fn = 0;
var serial_beging =0;

async function stm32_flash() {

	console.log("");
	console.log("++++++++++++++ starting upload process +++++++++++++++");

	// while (1) {
	// 	if (serial_beging==1) {
	// 		serial_beging =0;
	// 		break;
	// 	}
	// 	await delay(1000);
	// }

	gpio_bootmode_set();

	while (1) {
		if (gpio_setup_fn==1) {
			gpio_setup_fn = 0;
			break;
		}
		await delay(1000);
	}

	boot();

	while (1) {
		if (boot_fn==1) {
			boot_fn = 0;
			break;
		}
		await delay(1000);
	}

	gpio_bootmode_reset();

	while (1) {
		if (gpio_reset_fn==1) {
			gpio_reset_fn = 0;
			break;
		}
		await delay(1000);
	}

	console.log("")
	console.log("++++++++++++++++++++++ uploading done +++++++++++++++++++++");

}

// ----------------- serial open
// async function serial_com() {
	// portS1.on("open", function() {
	// 	console.log("--Serial connection open--");
	// 	portS1.on("data", function(data) {
	// 		serial_beging =1;
	// 		// console.log("reading :");
	// 		// console.log(data);
	// 		if (data.slice(0,1).toString('hex') == 79){
	// 			protocol_status = 1;
	// 		}
	// 	});
	// });
// }


// ------------------ gpio pin setup
async function gpio_bootmode_set() {
	// --------------------- gpio set

	// var gpio_set = "echo " + gpio_boot0 + " > /sys/class/gpio/unexport";
	// shellOut(gpio_set);
	// await delay(500);
	var gpio_set = "echo " + gpio_boot0 + " > /sys/class/gpio/export";
	shellOut(gpio_set);
	await delay(500);

	var gpio_direc = "echo out > /sys/class/gpio/gpio" + gpio_boot0 + "/direction";
	shellOut(gpio_direc);
	await delay(500);


	// var gpio_set = "echo " + gpio_reset + " > /sys/class/gpio/unexport";
	// shellOut(gpio_set);
	// await delay(500);
	var gpio_set = "echo " + gpio_reset + " > /sys/class/gpio/export";
	shellOut(gpio_set);
	await delay(500);

	var gpio_direc = "echo out > /sys/class/gpio/gpio" + gpio_reset + "/direction";
	shellOut(gpio_direc);
	await delay(500);

	// ------------------------ gpio BOOT0 set high

	var gpio_value = "echo 1 > /sys/class/gpio/gpio" + gpio_boot0 + "/value";
	shellOut(gpio_value);
	await delay(500);


	// ---------------------- gpio RESET pin on off

	var gpio_value = "echo 0 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(500);
	var gpio_value = "echo 1 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(500);
	var gpio_value = "echo 0 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(500);

	gpio_setup_fn =1;
}


async function gpio_bootmode_reset() {
	console.log("")
	console.log("exit boot mode");
	var gpio_value = "echo 0 > /sys/class/gpio/gpio" + gpio_boot0 + "/value";
	shellOut(gpio_value);
	await delay(1000);
	
			
	var gpio_value = "echo 0 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(1000);
	var gpio_value = "echo 1 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(1000);
	var gpio_value = "echo 0 > /sys/class/gpio/gpio" + gpio_reset + "/value";
	shellOut(gpio_value);
	await delay(1000);

	var gpio_set = "echo " + gpio_boot0 + " > /sys/class/gpio/unexport";
	shellOut(gpio_set);
	await delay(500);

	var gpio_set = "echo " + gpio_reset + " > /sys/class/gpio/unexport";
	shellOut(gpio_set);
	await delay(500);

	gpio_reset_fn = 1;
}



async function boot(){
	protocol_status = 0;

	// --------------------------------- enter boot mode
	while(1) {
		console.log("");
		// console.log("Request for enter boot mode ---------/");

		uart_send(0x7F);
		await delay(1000);

		if ( protocol_status == 1){
			protocol_status = 0;
			console.log("----------- Boot mode enable");
			break;
		}
		else {
			console.log("Fail: Request for enter boot mode. Retry in 2s");
			await delay(2000);
			boot();
		}
	}


	// --------------------------------- erase memory
	while(1){
		// console.log("");
		// console.log("Request for flash erase --------/");

		uart_send(0x43);
		await delay(10);
		uart_send(0xBC);
		await delay(10);

		await delay(100);

		if ( protocol_status == 1){
			protocol_status = 0;
			// console.log("----------- erasing flash");
			// console.log("Request for know flash erase success ------------/");

			uart_send(0xFF);
			await delay(10);
			uart_send(0x00);
			await delay(10);

			await delay(100);

			if ( protocol_status == 1){
				protocol_status = 0;
				console.log("----------- flash erase success");
				break;
			}
			else {
				console.log("Fail: Request for konw flash erase success. Retry Request for flash erase in 2s");
				console.log("");
				await delay(2000);
				boot();
			}
		}
		else {
			console.log("Fail: Request for flash erase. Retry Request for flash erase in 2s");
			console.log("");
			await delay(2000);
			boot();
		}

	}



	// ------------------------------------- bin read
	var binFile = fs.readFileSync(bin_location);
	// var binFile = fs.readFileSync('/TEST/serial/l2_old_v3_5.bin');
	// var binFile = fs.readFileSync('/TEST/serial/PWM2.bin');
	var bin_byte = binFile.length;
	var total_packet = Math.floor(bin_byte/packet_data_size) +1;
	console.log("");
	console.log("bin file read success, bin size : " + bin_byte + " bytes, packets : " + total_packet);
	console.log("");
	process.stdout.write("uploading");

	var address = 0x08000000;
	var write_address = address;
	var byte_count = 0;
	var packet_send = 1;

	var data_send =1;

	// ---------------------------------- packet send
	while(data_send) {
		process.stdout.write(" _");
		// console.log("-----> configure to send packet: " + packet_send );

		write_address = address + packet_data_size * (packet_send-1);
		// console.log('starting address :' + write_address);

		var byte1 = 0xff & (write_address >> 24);
		var byte2 = 0xff & (write_address >> 16);
		var byte3 = 0xff & (write_address >> 8);
		var byte4 = 0xff & write_address;
		var byte5 = byte1^byte2^byte3^byte4;

		// console.log(byte1, byte2, byte3, byte4, byte5);

		while(1){
			// console.log("Request for begging flash upload ----------------------/");
			uart_send(0x31);
			await delay(2);
			uart_send(0xCE);
			await delay(2);

			await delay(10);

			if ( protocol_status == 1){
				protocol_status = 0;

				// console.log("uploading address ---------------------------/");
				uart_send(byte1);
				await delay(2);
				uart_send(byte2);
				await delay(2);
				uart_send(byte3);
				await delay(2);
				uart_send(byte4);
				await delay(2);
				uart_send(byte5);
				await delay(2);

				await delay(10);
				if ( protocol_status == 1){
					// console.log('-------------------- address send success');
					protocol_status = 0;
					break;
				}
				else {
					console.log("");
					console.log("Fail: uploading address. Retry Request for begging flash upload in 2s");
					console.log("");
					await delay(2000);
					boot();
				}
			}
			else {
				console.log("");
				console.log("Fail: Request for begging flash upload. Retry Request for begging flash upload in 2s");
				console.log("");
				await delay(2000);
				boot();
			}
		}


		while(1) {
			// console.log("sending data in packet ----------------------/");

			var check_sum = 0;

			if (packet_send < total_packet) {
				var sending_byte = packet_data_size;
			}
			else {
				data_send = 0;
				var sending_byte = bin_byte - (packet_send-1)*packet_data_size;
			}

			// console.log('number of byte in send packet :' + sending_byte);
			uart_send((sending_byte-1));
			await delay(1);

			check_sum = check_sum ^ (sending_byte-1);

			for (let i =0; i< sending_byte; i++) {
				var byte_pos = (packet_send-1)*packet_data_size + i;
				// console.log('byte number: '+byte_pos+', byte: ' + binFile[byte_pos]);
				uart_send(binFile[byte_pos]);
				check_sum = check_sum ^binFile[byte_pos];
				await delay(1);
			}

			uart_send(check_sum);
			await delay(1);

			await delay(10);

			if ( protocol_status == 1){
				packet_send = packet_send +1;
				// console.log('----------------------------- packet send success');
				protocol_status = 0;
				break;
			}
			else {
				console.log("");
				console.log('------------------- packet send fail. Retry in 5s ----------------');
				data_send = 0;
				console.log("");
				await delay(5000);
				stm32_flash();
			}

			break;
		}

	}

	boot_fn =1;


}


// --------------------------- UART send
function uart_send(byte_value) {
	var value = Buffer.from([byte_value]);
		portS1.write( value, function(err) {
			if (err) {
				console.log('err uart_send');
			}
			// console.log(value);
		});
}





stm32_flash();