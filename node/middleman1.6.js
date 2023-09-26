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
var objDMG = require("./stamp_custom_modules/controlDMG");
var mymonitor = require('./stamp_custom_modules/mcuMonitor'); 


const portS1 = new SerialPort({ path: '/dev/ttyS1', baudRate: 9600,parity: 'even' }); 
const portS2 = new SerialPort({ path: '/dev/ttyS2', baudRate: 115200}); 
const portACM0 = new SerialPort({ path: '/dev/ttyACM0', baudRate: 9600});
const parserFixLen = portS1.pipe(new ByteLengthParser({ length: 20 }));
const parserFixLenDMG = portS2.pipe(new ByteLengthParser({ length: 10 }));
const parserReadLn = portACM0.pipe(new ReadlineParser({ delimiter: '\r\n'}));

/*Display*/
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

const fsmm = require('fs');
fsmm.readFile('tag.json', 'utf8', (err, data) => {
	  if (err) {console.error(err);return;}
	  console.log("+---------------------------------------")
	  console.log("|")
	  console.log("| Middleman Pacakge Version :",JSON.parse(data).pack_version)
	  console.log("| Updated on :",JSON.parse(data).date)
	  console.log("|")
	  console.log("+---------------------------------------")
	});

//========================================
//Internal function used by this module
//========================================

class LiveDataLEFT{ 
	constructor(page,icon,battPLive,costLive,balLive,timetillfullLive,currLive,voltLive){
		this.page = page;
		this.icon = icon;
		this.battPLive = battPLive;
		this.costLive = costLive;
		this.balLive = balLive;
		this.timetillfullLive = timetillfullLive;
		this.currLive = currLive;
		this.voltLive = voltLive;
	}
	getPage(){ return this.page;}
	getIcon(){ return this.icon;}
	getbattPLive(){return this.battPLive;}
	getcostLive(){return this.costLive;}
	getbalLive(){return this.balLive*100;}
	gettimetillfullLive(){return this.timetillfullLive;}
	getcurrLive(){return this.currLive;}
	getvoltLive(){return this.voltLive;}
	
	
}

class LiveDataRIGHT{
	constructor(page,icon,battPLive,costLive,balLive,timetillfullLive,currLive,voltLive){
		this.page = page;
		this.icon = icon;
		this.battPLive = battPLive;
		this.costLive = costLive;
		this.balLive = balLive;
		this.timetillfullLive =timetillfullLive;
		this.currLive = currLive;
		this.voltLive = voltLive;
	}
	getPage(){ return this.page;}
	getIcon(){ return this.icon;}
	getbattPLive(){return this.battPLive;} 
	getcostLive(){return this.costLive;}
	getbalLive(){return this.balLive*100;}
	gettimetillfullLive(){return this.timetillfullLive;}
	getcurrLive(){return this.currLive;}
	getvoltLive(){return this.voltLive;}

}

	

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
		
		case 78: //OFFLINE 
			displayString = '{ \"page\":78,\"wifi\":'+networkStrength.toString()+',\"heat\":'+heatWarning.toString()+'}';
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

function readMCUData(mode){
	return obj.getMCUData(mode)
}

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


function writeMCUData(controller,msg,stopCharge,errormsg){
	return obj.mcuMsgEncode(controller,msg,stopCharge,errormsg,portS1,parserFixLen)
}


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




// + GBT  -----------------------------------------------------------------------------------------------------------------


/*
GMT Dispaly : has 2 sides, L2 and GBT
	L2 ha 5 pages
	GBT has 6 pages

pages--------------------
Left (L2)
0 = IDELING
1 = AUTENDICATING
2 = PORT SELECTION
3 = PLUG-IN
4 = Charginh
5 = Full

Right (GBT)
0 = IDELING
1 = AUTENDICATING
2 = PORT SELECTION
3 = CHARGING MODE
4 = PLUG-IN
5 = Charginh
6 = Full
-------------------------
*/

function changeDMGPage(panel,stateNo){
	var page = 0;
	isSent = 0;
	
	
	switch(panel){
		case 'L':	
			switch(stateNo){
				case 0://Last charge
					if(liveDMGRight.getPage() == 0){ page = 0 ;}
					else if(liveDMGRight.getPage() == 1){ page = 6 ;}
					else if(liveDMGRight.getPage() == 2){ page = 12 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 19 ;}
					else if(liveDMGRight.getPage() == 5){ page = 25 ;}
					else if(liveDMGRight.getPage() == 6){ page = 31 ;}
					else{ page = 0;}
					liveDMGLeft.page = 0;
					liveDMGLeft.icon = 0;
					break;
				
				case 1://verify
					if(liveDMGRight.getPage() == 0){ page = 1 ;}
					else if(liveDMGRight.getPage() == 1){ page = 7 ;}
					else if(liveDMGRight.getPage() == 2){ page = 13 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 20 ;}
					else if(liveDMGRight.getPage() == 5){ page = 26 ;}
					else if(liveDMGRight.getPage() == 6){ page = 32 ;}
					else{ page = 0;}
					liveDMGLeft.page = 1;
					liveDMGLeft.icon = 0;
				
					break;
					
				case 2://select port
					if(liveDMGRight.getPage() == 0){ page = 2 ;}
					else if(liveDMGRight.getPage() == 1){ page = 8 ;}
					else if(liveDMGRight.getPage() == 2){ page = 14 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 21 ;}
					else if(liveDMGRight.getPage() == 5){ page = 27 ;}
					else if(liveDMGRight.getPage() == 6){ page = 33 ;}
					else{ page = 0;}
					liveDMGLeft.page = 2;
					liveDMGLeft.icon = 0;
					
					break;
				
				case 3://plug ev
					if(liveDMGRight.getPage() == 0){ page = 3 ;}
					else if(liveDMGRight.getPage() == 1){ page = 9 ;}
					else if(liveDMGRight.getPage() == 2){ page = 15 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 22 ;}
					else if(liveDMGRight.getPage() == 5){ page = 28 ;}
					else if(liveDMGRight.getPage() == 6){ page = 34 ;}
					else{ page = 0;}
					liveDMGLeft.page = 3;
					liveDMGLeft.icon = 0;
					
					break;
				
				case 4://charging
					if(liveDMGRight.getPage() == 0){ page = 4 ;}
					else if(liveDMGRight.getPage() == 1){ page = 10 ;}
					else if(liveDMGRight.getPage() == 2){ page = 16 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 23 ;}
					else if(liveDMGRight.getPage() == 5){ page = 29 ;}
					else if(liveDMGRight.getPage() == 6){ page = 35 ;}
					else{ page = 0;}
					liveDMGLeft.page = 4;
					liveDMGLeft.icon = 0;
					
					break;
				
				case 5://empty page
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 5 ;}
					else if(liveDMGRight.getPage() == 1){ page = 11 ;}
					else if(liveDMGRight.getPage() == 2){ page = 17 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 24 ;}
					else if(liveDMGRight.getPage() == 5){ page = 30 ;}
					else if(liveDMGRight.getPage() == 6){ page = 36 ;}
					else{ page = 0;}
					liveDMGLeft.page = 5;
					liveDMGLeft.icon = 0;
					break;
				
				case 6:// empty page to display charging full next
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 5 ;}
					else if(liveDMGRight.getPage() == 1){ page = 11 ;}
					else if(liveDMGRight.getPage() == 2){ page = 17 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 24 ;}
					else if(liveDMGRight.getPage() == 5){ page = 30 ;}
					else if(liveDMGRight.getPage() == 6){ page = 36 ;}
					else{ page = 0;}
					liveDMGLeft.page = 5;
					break;
					
				case 7:// empty page to display insufficient bal
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 5 ;}
					else if(liveDMGRight.getPage() == 1){ page = 11 ;}
					else if(liveDMGRight.getPage() == 2){ page = 17 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 24 ;}
					else if(liveDMGRight.getPage() == 5){ page = 30 ;}
					else if(liveDMGRight.getPage() == 6){ page = 36 ;}
					else{ page = 0;}
					liveDMGLeft.page = 5;
					break;
				
				case 8:// empty page to display invalid card
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 5 ;}
					else if(liveDMGRight.getPage() == 1){ page = 11 ;}
					else if(liveDMGRight.getPage() == 2){ page = 17 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 24 ;}
					else if(liveDMGRight.getPage() == 5){ page = 30 ;}
					else if(liveDMGRight.getPage() == 6){ page = 36 ;}
					else{ page = 0;}
					liveDMGLeft.page = 5;
					break;
				
				case 9:// empty page to display sys error
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 5 ;}
					else if(liveDMGRight.getPage() == 1){ page = 11 ;}
					else if(liveDMGRight.getPage() == 2){ page = 17 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 24 ;}
					else if(liveDMGRight.getPage() == 5){ page = 30 ;}
					else if(liveDMGRight.getPage() == 6){ page = 36 ;}
					else{ page = 0;}
					liveDMGLeft.page = 5;
					break;
					
				default:
					console.log("Left Invalid page")
					break;
				
			}
			
			break;
		
		case 'R':
			switch(stateNo){
				case 0:// last charge
					if(liveDMGLeft.getPage() == 0){ page = 0 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 1 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 2 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 3 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 4 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 5 ;}
					else{ page = 0;}
					liveDMGRight.page = 0;
					liveDMGRight.icon = 0;
					
					break;
				
				case 1:// please wait
					/*clean system error icon left and right*/
					//objDMG.dmgIcon(Buffer.from([0x18,0x00,0x01]),portS2)
					//objDMG.dmgIcon(Buffer.from([0x38,0x00,0x01]),portS2)
					if(liveDMGLeft.getPage() == 0){ page = 6 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 7 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 8 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 9 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 10 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 11 ;}
					else{ page = 0;}
					liveDMGRight.page = 1;
					liveDMGRight.icon = 0;
					
					break;
					
				case 2: // connect port
					if(liveDMGLeft.getPage() == 0){ page = 12 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 13 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 14 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 15 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 16 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 17 ;}
					else{ page = 0;}
					liveDMGRight.page = 2;
					liveDMGRight.icon = 0;
					
					break;
				
				case 3: // select charging mode
					if(liveDMGLeft.getPage() == 0){ page = 18 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 18 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 18 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 18 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 18 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 18 ;}
					else{ page = 0;}
					liveDMGRight.page = 3;
					liveDMGRight.icon = 0;
					break;
				
				case 4: // plug ev 
					if(liveDMGLeft.getPage() == 0){ page = 19 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 20 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 21 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 22 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 23 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 24 ;}
					else{ page = 0;}
					liveDMGRight.page = 4;
					liveDMGRight.icon = 0;
					
					break;
				
				case 5: // charging
					if(liveDMGLeft.getPage() == 0){ page = 25 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 26 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 27 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 28 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 29 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 30 ;}
					else{ page = 0;}
					liveDMGRight.page = 5;
					liveDMGRight.icon = 0;
					
					break;
				
				case 6: // empty page 
					if(liveDMGLeft.getPage() == 0){ page = 31 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 32 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 33 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 34 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 35 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 36 ;}
					else{ page = 0;}
					liveDMGRight.page = 6;
					liveDMGRight.icon = 0;
					
					break;
				
				case 7: // empty page for full charge
					if(liveDMGLeft.getPage() == 0){ page = 31 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 32 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 33 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 34 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 35 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 36 ;}
					else{ page = 0;}
					liveDMGRight.page = 6;
					
					break;
				
				case 8: // empty page for insufficient bal
					if(liveDMGLeft.getPage() == 0){ page = 31 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 32 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 33 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 34 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 35 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 36 ;}
					else{ page = 0;}
					liveDMGRight.page = 6;
					
					break;
				
				case 9: // empty page  for inval crd 
					if(liveDMGLeft.getPage() == 0){ page = 31 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 32 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 33 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 34 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 35 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 36 ;}
					else{ page = 0;}
					liveDMGRight.page = 6;
					
					break;
				
				case 10: // empty page for error
					if(liveDMGLeft.getPage() == 0){ page = 31 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 32 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 33 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 34 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 35 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 36 ;}
					else{ page = 0;}
					liveDMGRight.page = 6;
					
					break;
					
				default:
					//console.log("Right Side : FC has No such state to change page");
					console.log("Right Invalid page")
					break;
				
			}
			
			break;
			
		default:
			//console.log("Side selection wrong. side | state "+panel+" | "+stateNo);
			break;
			
	}
	
	//console.log("Side "+panel +" State change to "+stateNo+" | Page No change to (0-37)"+page)
	
	isSent = isSent + objDMG.dmgPageChangeMsg(page,portS2);
	
	return isSent;
	
}

function changeDMGData(panel,page,data){
	var dmgDataBuf = Buffer.alloc(4);
	isSent = 0;
	switch(panel){
		case 'L':
			switch(page){
				case 0://last charge[chargerID,LastCharge%,time,Cost,kwhRate]
					liveDMGLeft.icon = 0
					/* Charger ID*/
					cID = Buffer.from((data.getcid()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x00]),cID],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2); 
					
					/* Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x20]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Charger Operates Power*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x40]),cpower],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Last Time*/
					lastTime = Buffer.from((data.getlastTime()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x40]),lastTime],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Last Price (Original value should X10)*/ 
					lastPrice = Buffer.from((data.getlastCost()*10).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x60]),lastPrice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x80]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					return isSent;
					
					break;
					
					
					
				case 4://charging
					liveDMGLeft.icon = 0
					/*Live battery %*/
					battNow = Buffer.from((liveDMGLeft.getbattPLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x60]),battNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('L',liveDMGLeft.getbattPLive(),portS2),portS2);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGLeft.getcostLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x00]),costNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2); 
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGLeft.getbalLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x40]),balNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2); 
					
					/*Time till full*/
					timetillfullNow = Buffer.from((liveDMGLeft.gettimetillfullLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x80]),timetillfullNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Live current*/
					currNow = Buffer.from((liveDMGLeft.getcurrLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x60]),currNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Live volt*/
					voltNow = Buffer.from((liveDMGLeft.getvoltLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x80]),voltNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					
					
					return isSent;
					
					break;
				
				case 5://empty page
					liveDMGLeft.icon = 5
					dmgTurnOffAllIcons('L',portS2)
					break;
				
				case 6://charging full icon
					liveDMGLeft.icon = 6
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x12,0x00,0x84]),portS2)
					return isSent;
					
					break;
				
				case 7:// insufficient balance
					liveDMGLeft.icon = 7
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x14,0x00,0xB8]),portS2)
					return isSent;
					
					break;
				
				case 8:// inval card icon
					liveDMGLeft.icon = 8
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x16,0x00,0xBA]),portS2)
					return isSent;
					
					break;
				
				case 9:// error icon
					liveDMGLeft.icon = 9
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',portS2)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x18,0x00,0xBC]),portS2)
					return isSent;
					
					break;
				
				
				
				
					
				default:
					//console.log("Left Side : L2 has No such state to update data")
					dmgTurnOffAllIcons('L',portS2)
					break;
						
			}
			break;
			
		case 'R':
			switch(page){
				case 0://IDELING PAGE[chargerID,LastCharge%,time,Cost,kwhRate]
					liveDMGRight.icon = 0
					/*Charger ID*/
					cID = Buffer.from((data.getcid()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x10]),cID],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2); 
					
					/*Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x30]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Charger Operates*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x50]),cpower],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Last Time*/
					lastTime = Buffer.from((data.getlastTime()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x50]),lastTime],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Last Price (Original value should X10)*/
					lastPrice = Buffer.from((data.getlastCost()*10).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x70]),lastPrice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x90]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					return isSent;
					
					break;
					
				case 3: /*User Page*/
					liveDMGRight.icon = 0
					/* Usr Name First*/
					const nameFirst = data.getunameFirst();
					const usernameFirstBuf = Buffer.from(nameFirst.toString('hex'));
					const dmgnameBuf1 = Buffer.concat([Buffer.from([0x13,0x00]),usernameFirstBuf],2+nameFirst.length); //2 is the length of first buffer
					
					isSent = isSent + objDMG.dmgUsernameMsg(dmgnameBuf1,nameFirst.length,portS2);
					
					/* Usr Name Last*/
					const nameLast = data.getunameLast();
					const usernameLastBuf = Buffer.from(nameLast.toString('hex'));
					const dmgnameBuf2 = Buffer.concat([Buffer.from([0x14,0x00]),usernameLastBuf],2+nameLast.length);
					
					console.log("First name length :",nameFirst.length)
					console.log("First :",usernameFirstBuf )
					console.log("Last name length :",nameLast.length)
					console.log("Last:",usernameLastBuf )
					
					isSent = isSent + objDMG.dmgUsernameMsg(dmgnameBuf2,nameLast.length,portS2);
					
					/* User Balance*/
					userbal = Buffer.from((data.getubal()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x10]),userbal],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					return isSent;
					break;
					
					
				case 5://CHARGING
					liveDMGRight.icon = 0
					/*Live battery %*/
					battNow = Buffer.from((liveDMGRight.getbattPLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x70]),battNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('R',liveDMGRight.getbattPLive(),portS2),portS2);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGRight.getcostLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x10]),costNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGRight.getbalLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x50]),balNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2); 
					
					/*Time till full*/
					timetillfullNow = Buffer.from((liveDMGRight.gettimetillfullLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x90]),timetillfullNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Live current*/
					currNow = Buffer.from((liveDMGRight.getcurrLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x70]),currNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Live volt*/
					voltNow = Buffer.from((liveDMGRight.getvoltLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x90]),voltNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,portS2);
					
					/*Charging mode*/
					if(data.getcProfile() == 1){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x84,0x00,0x8E]),portS2);
					}
					else if(data.getcProfile() == 2){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x86,0x00,0x90]),portS2);
					}
					else if(data.getcProfile() == 3){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x88,0x00,0x92]),portS2);
					}
					else if(data.getcProfile() == 4){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x90,0x00,0x94]),portS2);
					}
					else{
						dmgTurnOffAllIcons('R',portS2)
					}
					
					return isSent;
					break;
				
				case 6://empty page
					liveDMGRight.icon = 0
					dmgTurnOffAllIcons('R',portS2)
					break;
				
				case 7://charging full icon
					liveDMGRight.icon = 7
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x32,0x00,0x96]),portS2)
					return isSent;
					
					break;
				
				case 8:// insufficient balance
					liveDMGRight.icon = 8
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x34,0x00,0xBE]),portS2)
					return isSent;
					
					break;
				
				case 9:// inval card icon
					liveDMGRight.icon = 9
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',portS2)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x36,0x00,0xC0]),portS2)
					return isSent;
					
					break;
				
				case 10:// error icon
					liveDMGRight.icon = 10
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',portS2)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x38,0x00,0xC2]),portS2)
					return isSent;
					
					break;
				
				
					
				default:
					dmgTurnOffAllIcons('R',portS2)
					//console.log("Right Side : FC has No such stateto update data")
					//dmgDataBuf = Buffer.from([0x00,0x00,0x00,0x00])
					break;		
			}
			break;
		
		
	}
	
	
}

function getBattIcon(mySide,myBattPr,myPort){
	
	switch(mySide){
		case 'L':
			
			if(myBattPr>=0 && myBattPr<10){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>40;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x40,0x00,0x64]); //0%
			}
			
			else if(myBattPr>=10 && myBattPr<20){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>42;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x42,0x00,0x66]); //10%
			}
			
			else if(myBattPr>=20 && myBattPr<30){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>44;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x44,0x00,0x68]); //20%
			}
			
			else if(myBattPr>=30 && myBattPr<40){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>46;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x46,0x00,0x6A]); //30%
			}
			
			else if(myBattPr>=40 && myBattPr<50){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>48;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x48,0x00,0x6C]); //40%
			}
			
			else if(myBattPr>=50 && myBattPr<60){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>50;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x50,0x00,0x6E]); //50%
			}
			else if(myBattPr>=60 && myBattPr<70){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>52;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x52,0x00,0x70]); //60%
			}
			
			else if(myBattPr>=70 && myBattPr<80){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>54;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x54,0x00,0x72]); //70%
			}
			
			else if(myBattPr>=80 && myBattPr<90){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>56;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x56,0x00,0x74]); //80%
			}
			
			else if(myBattPr>=90 && myBattPr<100){
				/*Cleaning the batt stacks*/
				for(let i=60 ;i>58;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				return Buffer.from([0x58,0x00,0x76]); //90%
			}
			
			else if(myBattPr == 100){
				return Buffer.from([0x60,0x00,0x78]); //100%
			}
			
			else {
				//return Buffer.from([0x18,0x00,0xBC]); //System Error L
			}
			
			break;
			
		case 'R':
			if(myBattPr>=0 && myBattPr<10){
				
				for(let i=82 ;i>62;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x62,0x00,0x64]); //0%
			}
			else if(myBattPr>=10 && myBattPr<20){
				
				for(let i=82 ;i>64;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x64,0x00,0x66]); //10%
			}
			else if(myBattPr>=20 && myBattPr<30){
				
				for(let i=82 ;i>66;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x66,0x00,0x68]); //20%
			}
			else if(myBattPr>=30 && myBattPr<40){
				
				for(let i=82 ;i>68;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x68,0x00,0x6A]); //30%
			}
			else if(myBattPr>=40 && myBattPr<50){
				
				for(let i=82 ;i>70;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x70,0x00,0x6C]); //40%
			}
			else if(myBattPr>=50 && myBattPr<60){
				
				for(let i=82 ;i>72;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x72,0x00,0x6E]); //50%
			}
			else if(myBattPr>=60 && myBattPr<70){
				
				for(let i=82 ;i>74;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x74,0x00,0x70]); //60%
			}
			else if(myBattPr>=70 && myBattPr<80){
				
				for(let i=82 ;i>76;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x76,0x00,0x72]); //70%
			}
			else if(myBattPr>=80 && myBattPr<90){
				
				for(let i=82 ;i>78;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x78,0x00,0x74]); //80%
			}
			else if(myBattPr>=90 && myBattPr<100){
				
				for(let i=82 ;i>80;i = i-2){
					var numberString = '0x'+i.toString();
					objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
				}
				
				return Buffer.from([0x80,0x00,0x76]); //90%
			}
			else if(myBattPr == 100){
				
				return Buffer.from([0x82,0x00,0x78]); //100%
			}
			else {
				//return Buffer.from([0x38,0x00,0xC2]); //System Error L
			}
	
	}
	
}

function dmgTurnOffAllIcons(mySide,myPort){
	switch(mySide){
		case 'L':
			/*Remove all icons starting from vp number 2000 to 2020*/
			for (let i=0; i < 20 ;i=i+2){
				var numberString ='0x'+i.toString();
				objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
			}
			break; 
		case 'R':
			/*Remove all icons starting from vp number 2020 to 2040*/
			for (let i=20; i < 40 ;i=i+2){
				var numberString ='0x'+i.toString();
				objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
			}
			
			/*Remove all icons starting from vp number 2084 to 2090*/
			for (let i=84; i < 91 ;i=i+2){
				var numberString ='0x'+i.toString();
				objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
			}
			break;
	}
	
}

function updateDisplayDMG(newSide,newPage,netDataL,netDataR){
	/*L2 data collect and analize for DMG Display
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
	isAllSent = 0;
	var liveLeftDataMid0 = readMCUData('msgId0');
	var liveLeftDataMid1 = readMCUData('msgId1');
	
	//console.log(liveLeftDataMid0);
	//console.log(liveLeftDataMid1);
	
	liveDMGLeft.voltLive = parseInt(liveLeftDataMid0[0]);
	//liveL2.currLive = parseInt(liveLeftDataMid0[1]);
	
	/*test*/
	liveDMGRight.voltLive  = parseInt(liveLeftDataMid1[1]);
	
	return new Promise((resolve,reject) => {
		if(newSide == 'L'){
			console.log("DMG side L: "+newPage.toString()+" "+(liveDMGLeft.icon).toString()+"   | DMG side R: "+ (liveDMGRight.page).toString()+" "+(liveDMGRight.icon).toString()+" *")
			changeDMGPage('L',newPage);
			changeDMGData('L',newPage,netDataL);
			
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			if(liveDMGRight.getIcon() == 0){
				changeDMGPage('R',liveDMGRight.page);
				changeDMGData('R',liveDMGRight.page,netDataR);
				}
			else{
				console.log("R changinf for icon")
				changeDMGPage('R',liveDMGRight.icon);
				changeDMGData('R',liveDMGRight.icon,netDataR);
			}
			
			resolve();
		}
		else if (newSide == 'R'){
			console.log("DMG side L: "+(liveDMGLeft.page).toString()+" "+(liveDMGLeft.icon).toString()+" * | DMG side R: "+ newPage.toString()+" "+(liveDMGRight.icon).toString())
			changeDMGPage('R',newPage);
			changeDMGData('R',newPage,netDataR);
			
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			if(liveDMGLeft.getIcon() == 0){
				changeDMGPage('L',liveDMGLeft.page);
				changeDMGData('L',liveDMGLeft.page,netDataL);
			}
			else{
				console.log("L changinf for icon")
				changeDMGPage('L',liveDMGLeft.icon);
				changeDMGData('L',liveDMGLeft.icon,netDataL);
			}
			
			
			
			resolve();
		}
	}).catch((err)=> console.error(err))
	
}


/*
Left (L2)
_________
pageNow - page 0-5
icon
costNow - Actual cost charge from cx X100
balNow
timetillfullNow
currNow
voltN

Right (GBT)
_________
page
battlive
costLive
balLive
timetillfullLive
currLive
voltLive
--------------------------*/
var liveDMGLeft =   new LiveDataLEFT(0,0,0,23,45,99,67,89);//L2 does not have batt but it shows as 0 here %
var liveDMGRight = new LiveDataRIGHT(0,0,0,33,54,56,78,72);

function pageUpdateDMG(newSide,newPage,netDataL,netDataR){
	return updateDisplayDMG(newSide,newPage,netDataL,netDataR);
}


/* TESTING Value change */
let testID = setInterval(()=>{
	if (liveDMGLeft.getbattPLive() <= 95){
		liveDMGLeft.battPLive = liveDMGLeft.getbattPLive() +5;}
	else{
		liveDMGLeft.battPLive = 0;
	}
	
	if (liveDMGRight.getbattPLive() <= 95){
		liveDMGRight.battPLive = liveDMGRight.getbattPLive() +5;}
	else{
		liveDMGRight.battPLive = 0;
	}
},500);

module.exports = {readMCUData,writeMCUData,pageChange,pageUpdateDMG,newTap,gpio,mcuMonitor}
















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

