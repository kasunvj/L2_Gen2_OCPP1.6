/*
middleman V 1.4

ttyS1 is the serial UART1 communicating with the MCU
	-20 bites buffered paeser for MCU msgs
ttyS2 is the serial FUART1 communicating in the RS485 Bus
	-10 bites buffered paeser for DMG Display msgs
ttyACM0 is the USB serial communicating with the  in the tap card
*/
const {SerialPort} = require('serialport');
const {ByteLengthParser}= require('@serialport/parser-byte-length');
const {ReadlineParser} = require('@serialport/parser-readline');
const {exec}=require("child_process");
const {execSync} = require('child_process');

var obj = require("./stamp_custom_modules/mcuMsgHandle3");
var objTap = require("./stamp_custom_modules/tapcardGet");
var objNet = require("./stamp_custom_modules/networkCheck");
var mymonitor = require('./stamp_custom_modules/mcuMonitor'); 

class Middleman extends SerialPort{
	constructor(type,comP,baud){
		this.type = type
		this.comP = comP
		this.baud = baud
		this.portX = this.initSerial()
		this.parserFixLen = this.initFixLen()
	}
	
	initSerial(){
		console.log("aaaa ",this.comP)
		return new SerialPort({ path:'/dev/'+this.comP, baudRate: parseInt(this.baud),parity: 'even' })
	}
	
	initFixLen(){
		return this.portX.pipe(new ByteLengthParser({ length: 20 }));
	}
	
	getPortX(){
		return this.portX
	}
	
	getFixedLenPipe(){
		return this.parserFixLen
	}
	
	readMCUData(mode){
		obj.getMCUData(mode)
	}
	
	writeMCUData(controller,msg,stopCharge,errormsg){
		return obj.mcuMsgEncode(controller,msg,stopCharge,errormsg,this.portX,parserFixLen)
	}
}


//const portS1 = new SerialPort({ path: '/dev/', baudRate: 9600,parity: 'even' }); 
const portACM0 = new SerialPort({ path: '/dev/ttyACM0', baudRate: 9600});
const parserFixLen = portS1.pipe(new ByteLengthParser({ length: 20 }));
const parserReadLn = portACM0.pipe(new ReadlineParser({ delimiter: '\r\n'}));

/*Display */
const fs = require('fs');
const fifoPath = '/tmp/my_fifo';

var i = 0;
var t = 1;
var heatWarning = 0;
var displayState = 66;
var networkConnectivity = 0;
var networkStrength = 1;
var tapcardString = '';
var tapcardDetect = 0;
var displayString = '';
var fastDisplayUpdate = 0;
let pipeID;
let pipeIDFast;
var isSent = 0;
var isAllSent = 0;
var f = 80;


/*Charger Data - Not Live*/
var cID = Buffer.alloc(2);
var lastCharge = Buffer.alloc(2);
var lastTime = Buffer.alloc(2);
var lastPrice = Buffer.alloc(2);
var cpower = Buffer.alloc(2);
var cprice = Buffer.alloc(2); 
var userbal = Buffer.alloc(2); 

/*Charger Data - Live*/
var battNow = Buffer.alloc(2);
var costNow = Buffer.alloc(2);
var balNow = Buffer.alloc(2);
var timetillfullNow = Buffer.alloc(2);
var currNow = Buffer.alloc(2);
var voltNow = Buffer.alloc(2);

var EventEmitter = require('events');
var L2dataEmitter = new EventEmitter();



//========================================
//Internal function used by this module
//========================================

	

function listenTapCard(){
	console.log('open-tap');
	parserReadLn.on('data',function(data){
		
		newTap.tapString = objTap.tapcardNoGet(data);
		newTap.tap = 1;
		//console.log(tapcardString);
		
	});
}

function readMCU(){
	console.log('opened');
	parserFixLen.on('data', function(data){
		if(obj.mcuMsgDecode(data) == 0){ 
			L2dataEmitter.emit('data',obj.mcuDataM0,obj.mcuDataM1,obj.mcuStateL2)
			//nothing to be  done, calling mcuMsgDecode also save latest values
			//and update values that uses for DMG Display
			//updateDisplayDMG(liveDMGLeft,liveDMGLeft);
		}
		
	});
}


function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 

function updateNet(){
	//console.log('open-net');
	
	//networkConnectivity = objNet.netwrokStatusGet();
	/*
	if the system is using wifi = 'WIFI'
	                         4G = '4G'
	*/
	networkStrength = objNet.networkStrengthGet('WIFI');
	
}

function updateDisplay(displayState,id){
	
	/*mcu data collect and 
	analize
	MODE 0
		mcuData0[0] : Volatage
		mcuData0[1] : Current
		mcuData0[2] : Power
		mcuData0[3] : 0
	
	MODE 1
		mcuData1[0] : KWh
		mcuData1[1] : t1
		mcuData1[2] : t2
		mcuData1[3] : t3
	*/
	var mcuData0 = obj.getMCUData('msgId0');
	var mcuData1 = obj.getMCUData('msgId1');
	
	// heat
	if (mcuData1[1]>65){heatWarning = 1;}
	else{heatWarning = 0;}
	
	
	//console.log("*************************");
	
	
	/*update display state based on mcu data and network data*/
	switch(displayState){
		case 67: //LOADING
			displayString = '{ \"page\":66,\"wifi\":'+networkStrength.toString()+',\"heat\":'+heatWarning.toString()+'}';
			break;
			
		case 68: //LAST CHARGE
			if(i<1){
				displayString = '{ \"page\":68,\"id\":\"A1234\",\"kwh\":'+mcuData1[0].toString()+',\"cost\":'+mcuData0[1].toString()+',\"time\":6789,\"bal\":6789.1,\"error\":'+mcuData0[1].toString()+',\"warn\":3,\"cur\":34.9,\"timer\":'+t.toString()+',\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
			}
			else{
				displayString = '{ \"page\":68,\"id\":\"A1234\",\"kwh\":'+mcuData1[0].toString()+',\"cost\":'+mcuData0[1].toString()+',\"time\":6789,\"bal\":6789.1,\"error\":'+mcuData[1].toString()+',\"warn\":3,\"cur\":34.9,\"timer\":'+t.toString()+',\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
			}
			
			break;
			
		case 69: //VERIFING 
			if(i<1){
				displayString = '{ \"page\":69,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				tapcardDetect = 0;
			}
			else{
				displayString = '{ \"page\":69,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
			}
			break;
			
		case 70:// LOADING
			if(i<1){
				displayString = '{ \"page\":70,\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":70,\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
		
		case 71: //FAILED
			if(i<1){
				displayString = '{ \"page\":71,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":71,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
		
		case 72: //PLUG your EV
			if(i<1){
				displayString = '{ \"page\":72,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":'+f.toString()+',\"bal\":1000.5,\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":72,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":'+f.toString()+',\"bal\":1000.5,\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				f = f-1;
				
				if(fastDisplayUpdate){
					clearInterval(id);
					let pipeIDFast = setInterval(() => updateDisplay(displayState,pipeIDFast),900);
					fastDisplayUpdate = 0;
				}
				}
			break;
		
		case 73: //Charging
			if(i<1){
				displayString = '{ \"page\":73,\"id\":\"A1234\",\"kwh\":'+mcuData1[0].toString()+',\"cost\":'+mcuData1[1].toString()+',\"time\":6789,\"bal\":6789.1,\"error\":'+mcuData0[1].toString()+',\"warn\":3,\"cur\":'+mcuData0[1].toString()+',\"timer\":1,\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
			}
			else{
				displayString = '{ \"page\":73,\"id\":\"A1234\",\"kwh\":'+mcuData1[0].toString()+',\"cost\":'+mcuData1[1].toString()+',\"time\":6789,\"bal\":6789.1,\"error\":'+mcuData0[1].toString()+',\"warn\":3,\"cur\":'+mcuData0[1].toString()+',\"timer\":0,\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				if(fastDisplayUpdate){
					clearInterval(id);
					let pipeIDFast = setInterval(() => updateDisplay(displayState,pipeIDFast),900);
					fastDisplayUpdate = 0;
				}
				
			}
			break;
			
		case 74: //UNPLUG your EV
			if(i<1){
				displayString = '{ \"page\":74,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":74,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
		
		case 75: //ERROR
			if(i<1){
				displayString = '{ \"page\":75,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"error\":1,\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":75,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"error\":1,\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
			
		case 76: //WARNING
			if(i<1){
				displayString = '{ \"page\":76,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"warn\":1,\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":76,\"id\":\"A1234\",\"wifi\":'+networkStrength.toString()+',\"time\":0000,\"cost\":1000.5,\"kwh\":34.7,\"warn\":1,\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
				
		case 77: //WAITING TO CAHRGE
			if(i<1){
				displayString = '{ \"page\":77,\"id\":\"A111\",\"kwh\":0,\"cost\":0,"cur\":0,\"time\":0,\"bal\":0,\"error\":'+mcuData0[1].toString()+',\"warn\":3,\"cur\":'+mcuData0[1].toString()+',\"timer\":1,\"wifi\":'+networkStrength.toString()+',\"updatePage\":1,\"heat\":'+heatWarning.toString()+'}';
				i++;
				}
			else{
				displayString = '{ \"page\":77,\"id\":\"A1111\",\"kwh\":0,\"cost\":0,"cur\":0,\"time\":0,\"bal\":0,\"error\":'+mcuData0[1].toString()+',\"warn\":3,\"cur\":'+mcuData0[1].toString()+',\"timer\":1,\"wifi\":'+networkStrength.toString()+',\"updatePage\":0,\"heat\":'+heatWarning.toString()+'}';
				}
			break;
		
		default:
			displayString = '{ \"page\":67,\"wifi\":'+networkStrength.toString()+',\"heat\":'+heatWarning.toString()+'}';
			break;
			
	}
	
	
	//console.log("writing to page: ",displayState,mcuData[1],networkStrength);
	
	
	//wrirng to page
	
	const fd = fs.openSync(fifoPath, 'w');
	const data = displayString;
	fs.writeSync(fd, data.padEnd(150));
	fs.closeSync(fd);		
}

function bye(){
	//exec('echo '+0+' > /sys/class/gpio/unexport', (error,stdout,stderr) => {});
	console.log('Gracefully died, Peace!!!');
    process.exit();
}

function halfbye(){
	//exec('echo '+0+' > /sys/class/gpio/unexport', (error,stdout,stderr) => {});
	console.log('Not gracefully died, No Peace!!!');
    process.exit();
}

function gracefulDead(){
	
	//releasing CID in qmicli
	var qmclicmd3 = "qmicli --device=/dev/cdc-wdm0 --nas-noop --client-cid="+  objNet.networkCIDGet().toString();
	var releaseCIDPromise = new Promise((resolve,reject) => {
									exec(qmclicmd3,(error, stdout, stderr) => {
										if (error){
											console.log(`error: ${error.message}`);
											reject();
											return;
											} 
										if (stderr){
											console.log(`stderr: ${stderr.message}`);
											reject();
											return;
											}
										console.log("CID clear ",objNet.networkCIDGet());
										resolve();
										}) 
										
								});
	
	releaseCIDPromise.then(bye,halfbye);
	
}

//========================================
//Functions exposed from this module
//========================================

/*
function readMCUData(mode){
	return obj.getMCUData(mode)
}*/

function mcuMonitor(control,st){
	mymonitor.monitor(control,st)
}

class tap {
	constructor(tap,tapString){
		this.tap = tap;
		this.tapString = tapString;
    }
	getTap(){
		return this.tap;
		} 
	getTapString(){
		return this.tapString;
	}
};
var newTap = new tap(0,'');

function ch(s){
	return "hapi hapi" +s
}

/*
function writeMCUData(controller,msg,stopCharge,errormsg){
	return obj.mcuMsgEncode(controller,msg,stopCharge,errormsg,portS1,parserFixLen)
}
*/

/*---------------------------
Other display
-----------------------------*/
function pageChange(newDiaplayState){
	
	var dummyID = setInterval(() => {},0)
	while(dummyID--){ 
		clearInterval(dummyID);
		//console.log("clear time interval id")
		} 
	
	if ((newDiaplayState == 72) || (newDiaplayState == 73) ){
		fastDisplayUpdate = 1;
	}
	
	let pipeID = setInterval(()=>updateDisplay(newDiaplayState,pipeID),2000);
	
	
}

/*GPIO*/
class gpio{
	constructor(pin,dir,val){
		this.pin = pin;
		this.dir = dir;
		this.val = val;
		
	}
	
	create(myPin,myDir,myVal){
		this.pin = myPin;
		this.dir = myDir;
		this.val = myVal;
		
		return new Promise((resolve) => {
			exec('echo '+myPin.toString()+' > /sys/class/gpio/export', (error,stdout,stderr) => {
				//console.log("1");	
				exec('echo '+myDir.toString()+' > /sys/class/gpio/gpio'+myPin+'/direction', (error,stdout,stderr) => {
					//console.log("2");
					if(myVal == 1){
						this.on();
					}
					else{
						this.off();
					}
					console.log("setting gpio "+this.pin.toString()+" as "+this.dir);
					resolve();
					});
				});
			});
	}
	
	on(){
		exec('echo 1 > /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
			//console.log("on :",this.pin);
		});
	}
	
	off(){
		exec('echo 0 > /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
			//console.log("off :",this.pin);
		});
	}
	
	isOn(){
		
		return new Promise((resolve) => {
			exec('cat < /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
				//console.log("gpio "+this.pin.toString()+": ",parseInt(stdout));
				resolve(parseInt(stdout));
				});
		});
	}
	
	isPressed(){
		return new Promise((resolve) => {
			exec('cat < /proc/gpio_intr', (error,stdout,stderr) => {
				//console.log("gpio "+this.pin.toString()+": ",parseInt(stdout));
				resolve(parseInt(stdout));
				});
		})
	}
	
	unexport(){
		return new Promise((resolve) => {
			exec('echo '+this.pin.toString()+' > /sys/class/gpio/unexport', (error,stdout,stderr) => {
				console.log("gpio "+this.pin.toString()+" unexported")
				resolve();
				});
			});
	}
	
	
	
}
//========================================
// Async running functions
//========================================

/* Read from MCU */
portS1.on('open',readMCU); 

		
/* Read from Tap Card*/
portACM0.on('open',listenTapCard);


/*Updating network status*/
let networkcheckID = setInterval(()=>updateNet(),5000);


/*Graceful kill*/
process.on('SIGINT', gracefulDead);
process.on('SIGTERM', gracefulDead);



module.exports = {pageChange,newTap,gpio,mcuMonitor,ch,Middleman}


/*
Appendix:

{"page":67, "wifi":3, "heat": 1}                                       //ALL
{"page":68,"kwh":21.1,"cost":500.00,"time":7568,"wifi":3, "heat": 1}                       // Last CHARGE
{"page":69,"id":"C8689","wifi":3, "heat": 1}                                               // VERIFYING
{"page":70,"wifi":3, "heat": 1}                                                            // LOADING
{"page":71,"id":"F0900","wifi":3, "heat": 1}                                               //FAILED
{"page":72,"id":"A0090", "bal":8000,"time":8400,"wifi":3, "heat": 1}                       //PLUG YOUR EV
{"page":73,"id":"H0890","cur":21.3,"kwh":24.1,"cost":10000.50,timer:1,"wifi":3, "heat": 1}   // CHARGING
{"page":74,"id":"A0990","kwh":88.9,"cost":90000.98,"time":256400,"wifi":3, "heat": 1}      //UNPLUG YOUR EV
{"page":75,"id":"F7890","kwh":40.7,"cost":9087,"time":89769,"error":92,"wifi":3, "heat": 1} //ERROR
{"page":76,"id":"F0989","kwh":40.7,"cost":8907,"time":6789,"warn":2,"wifi":3, "heat": 1}    //WARNING

***Must add 150 PAD before write JSON
  // Write the data to the named pipe 
  fs.writeSync(fd, data.padEnd(150)); // Node code

page 67-76
wifi 0-3
heat 0,1
timer 0,1
time Total time in seconds
id String

Command flow for charging page:
{"page":73,"id":"H0890","cur":21.3,"kwh":24.1,"cost":0,timer:1,"wifi":3, "heat": 1} // First Start timer.(timer:1)
// Then continuously update liveDMGRight,kwh & cost.(timer:0)
{"page":73,"id":"H0890","cur":49.8,"kwh":55.6,"cost":100.50,timer:0,"wifi":3, "heat": 1}


command to write in to pipe
'{ \"page\":'+page.toString()+',\"id\":\"A1234\",\"kwh\":34.7,\"cost\":'+mcuData[1].toString()+',\"time\":6789,\"bal\":6789.1,\"error\":'+mcuData[1].toString()+',\"warn\":3,\"cur\":34.9,\"timer\":'+t.toString()+',\"wifi\":2,\"heat\":'+heatWarning.toString()+'}' ;
*/

