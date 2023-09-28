/*
middleman V 1 dc

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

var obj = require("./stamp_custom_modules/mcuMsgHandle5");
var objTap = require("./stamp_custom_modules/tapcardGet");
var objNet = require("./stamp_custom_modules/networkCheck");
var objDMG = require("./stamp_custom_modules/controlDMG");
var mymonitor = require('./stamp_custom_modules/mcuMonitor'); 

/*Loding configurations*/
const fsmm = require('fs');
const data = fsmm.readFileSync('config-system.json','utf8');
const configObj = JSON.parse(data)

class Charger{
	constructor(path,baud){
		this.path = path
		this.baud = baud
	}
	
	getPath(){
		return this.path
	}
	
	getBaud(){
		return this.baud
	}
}

class Display{
	constructor(path,baud,port,parser){
		this.path = path
		this.baud = baud
		this.port = port
	}
	
	getPath(){
		return this.path
	}
	
	getBaud(){
		return this.baud
	}
	
	getPort(){
		return this.port
	}
	
	getParser(){
		return this.parser
	}
	
}

var L2 = new Charger('',0)
var FC = new Charger('',0)
var DISP = new Display('',0,'','')

console.log("Charger Configuration-----------+")
console.log("Charger id : ",configObj.c_id);
for (var i=0;i<2;i++){
	if(configObj.charger_sys[i].dev=='/dev/ttyS1'){
		if(configObj.charger_sys[i].chtype == 'L2'){
			L2.path = '/dev/ttyS1'
			L2.baud = parseInt(configObj.charger_sys[i].baud)
		}
		else if(configObj.charger_sys[i].chtype == 'FC'){
			FC.path = '/dev/ttyS1'
			FC.baud = parseInt(configObj.charger_sys[i].baud)
		}
		else{
		console.log("Wrong Charger type configuration!")
		}
		
	}
	else if(configObj.charger_sys[i].dev=='/dev/ttyS2'){
		if(configObj.charger_sys[i].chtype == 'L2'){
			L2.path = '/dev/ttyS2'
			L2.baud = parseInt(configObj.charger_sys[i].baud)
		}
		else if(JSON.parse(data).charger_sys[i].chtype == 'FC'){
			console.log('FC   : ttyS2',configObj.charger_sys[i].baud)
			FC.path = '/dev/ttyS2'
			FC.baud = parseInt(configObj.charger_sys[i].baud)
		}
		else{
			console.log("Wrong Charger type configuration!")
		}		
	}
	else{
		console.log("Wrong port type configuration!")
	}
}


const portL2 = new SerialPort({path:L2.getPath(),baudRate:L2.getBaud()});
const parserFixLenL2 = portL2.pipe(new ByteLengthParser({ length: 20 }));

const portFC = new SerialPort({path:FC.getPath(),baudRate:FC.getBaud()});
const parserFixLenFC = portFC.pipe(new ByteLengthParser({ length: 20 }));

const portACM0 = new SerialPort({ path: '/dev/ttyACM0', baudRate: 9600});
const parserReadLn = portACM0.pipe(new ReadlineParser({ delimiter: '\r\n'}));



if(configObj.disp_sys[0].conn_bus == "L2"){
	DISP.path = L2.path;
	DISP.baud = L2.baud;
	DISP.port = portL2;
	DISP.parser = portL2.pipe(new ByteLengthParser({ length: 10 }));
}
else if(configObj.disp_sys[0].conn_bus == "FC"){
	DISP.path = FC.path;
	DISP.baud = FC.baud;
	DISP.port = portFC;
	DISP.parser = portFC.pipe(new ByteLengthParser({ length: 10 }));
}
else{
	console.log("Wrong display Configuration!")
}

console.log('L2   :',portL2.path,portL2.baudRate);
console.log('FC   :',portFC.path,portFC.baudRate);
console.log('DISP :',DISP.port.path,DISP.port.baudRate);
console.log("--------------------------------+")


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

function readMCUL2(){
	console.log('opened L2');
	parserFixLenL2.on('data', function(data){
		console.log('\x1b[96m')
		if(obj.mcuMsgDecode(data) == 0){			
			L2dataEmitter.emit('data',obj.mcuDataM0,obj.mcuDataM1,obj.mcuStateL2)
			//nothing to be  done, calling mcuMsgDecode also save latest values
			//and update values that uses for DMG Display
			//updateDisplayDMG(liveDMGLeft,liveDMGLeft);
		}
		console.log('\x1b[0m')
		
		
	});
}

function readMCUFC(){
	console.log('opened FC');
	parserFixLenFC.on('data', function(data){
		console.log('\x1b[95m')
		if(obj.mcuMsgDecode(data) == 0){ 
			//L2dataEmitter.emit('data',obj.mcuDataM0,obj.mcuDataM1,obj.mcuStateL2)
			//nothing to be  done, calling mcuMsgDecode also save latest values
			//and update values that uses for DMG Display
			//updateDisplayDMG(liveDMGLeft,liveDMGLeft);
		}
		console.log('\x1b[0m')
		
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
	if(controller == "M")
		return obj.mcuMsgEncode(controller,msg,stopCharge,errormsg,portL2,parserFixLenL2)
	else if(controller == "m")
		return obj.mcuMsgEncode(controller,msg,stopCharge,errormsg,portFC,parserFixLenFC)
	else
		return -1
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

/* Read from MCU L2*/
portL2.on('open',readMCUL2);  //---- L2

/* Read from MCU FC*/
portFC.on('open',readMCUFC);  // ---- FC

		
/* Read from Tap Card*/
portACM0.on('open',listenTapCard);


/*Updating network status*/
let networkcheckID = setInterval(()=>updateNet(),5000);


/*GPIO*/


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

function changeDMGPage(panel,stateNo,port){
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
					//objDMG.dmgIcon(Buffer.from([0x18,0x00,0x01]),portFC)
					//objDMG.dmgIcon(Buffer.from([0x38,0x00,0x01]),portFC)
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
	
	isSent = isSent + objDMG.dmgPageChangeMsg(page,port);
	
	return isSent;
	
}

function changeDMGData(panel,page,data,port){
	var dmgDataBuf = Buffer.alloc(4);
	isSent = 0;
	switch(panel){
		case 'L':
			switch(page){
				case 0://last charge[chargerID,LastCharge%,time,Cost,kwhRate]
					liveDMGLeft.icon = 0
					/* Charger ID*/
					cID = Buffer.from((data.getcid()).toString(16),'hex');
					console.log("L ",data.getcid(),cID)
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x00]),cID],7);
					isSent = isSent + objDMG.dmgCIDChangeMsg(dmgDataBuf,port); 
					
					/* Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x20]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates Power*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x40]),cpower],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time*/
					lastTime = Buffer.from((data.getlastTime()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x40]),lastTime],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Price (Original value should X10)*/ 
					lastPrice = Buffer.from((data.getlastCost()*10).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x60]),lastPrice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x80]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					return isSent;
					
					break;
					
					
					
				case 4://charging
					liveDMGLeft.icon = 0
					/*Live battery %*/
					battNow = Buffer.from((liveDMGLeft.getbattPLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x60]),battNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('L',liveDMGLeft.getbattPLive(),port),port);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGLeft.getcostLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x00]),costNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port); 
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGLeft.getbalLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x40]),balNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port); 
					
					/*Time till full*/
					timetillfullNow = Buffer.from((liveDMGLeft.gettimetillfullLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x80]),timetillfullNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Live current*/
					currNow = Buffer.from((liveDMGLeft.getcurrLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x60]),currNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Live volt*/
					voltNow = Buffer.from((liveDMGLeft.getvoltLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x80]),voltNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					
					
					return isSent;
					
					break;
				
				case 5://empty page
					liveDMGLeft.icon = 5
					dmgTurnOffAllIcons('L',port)
					break;
				
				case 6://charging full icon
					liveDMGLeft.icon = 6
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x12,0x00,0x84]),port)
					return isSent;
					
					break;
				
				case 7:// insufficient balance
					liveDMGLeft.icon = 7
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x14,0x00,0xB8]),port)
					return isSent;
					
					break;
				
				case 8:// inval card icon
					liveDMGLeft.icon = 8
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x16,0x00,0xBA]),port)
					return isSent;
					
					break;
				
				case 9:// error icon
					liveDMGLeft.icon = 9
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x18,0x00,0xBC]),port)
					return isSent;
					
					break;
				
				
				
				
					
				default:
					//console.log("Left Side : L2 has No such state to update data")
					dmgTurnOffAllIcons('L',port)
					break;
						
			}
			break;
			
		case 'R':
			switch(page){
				case 0://IDELING  PAGE[chargerID,LastCharge%,time,Cost,kwhRate]
					liveDMGRight.icon = 0
					/*Charger ID*/
					cID = Buffer.from((data.getcid()).toString(16),'hex');
					console.log("R ",data.getcid(),cID)
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x10]),cID],7);
					isSent = isSent + objDMG.dmgCIDChangeMsg(dmgDataBuf,port); 
					
					/*Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x30]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x50]),cpower],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time*/
					lastTime = Buffer.from((data.getlastTime()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x50]),lastTime],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Price (Original value should X10)*/
					lastPrice = Buffer.from((data.getlastCost()*10).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x70]),lastPrice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x90]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					return isSent;
					
					break;
					
				case 3: /*User Page*/
					liveDMGRight.icon = 0
					/* Usr Name First*/
					const nameFirst = data.getunameFirst();
					const usernameFirstBuf = Buffer.from(nameFirst.toString('hex'));
					const dmgnameBuf1 = Buffer.concat([Buffer.from([0x13,0x00]),usernameFirstBuf],2+nameFirst.length); //2 is the length of first buffer
					
					isSent = isSent + objDMG.dmgUsernameMsg(dmgnameBuf1,nameFirst.length,port);
					
					/* Usr Name Last*/
					const nameLast = data.getunameLast();
					const usernameLastBuf = Buffer.from(nameLast.toString('hex'));
					const dmgnameBuf2 = Buffer.concat([Buffer.from([0x14,0x00]),usernameLastBuf],2+nameLast.length);
					
					console.log("First name length :",nameFirst.length)
					console.log("First :",usernameFirstBuf )
					console.log("Last name length :",nameLast.length)
					console.log("Last:",usernameLastBuf )
					
					isSent = isSent + objDMG.dmgUsernameMsg(dmgnameBuf2,nameLast.length,port);
					
					/* User Balance*/
					userbal = Buffer.from((data.getubal()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x10]),userbal],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					return isSent;
					break;
					
					
				case 5://CHARGING
					liveDMGRight.icon = 0
					/*Live battery %*/
					battNow = Buffer.from((liveDMGRight.getbattPLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x70]),battNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('R',liveDMGRight.getbattPLive(),port),port);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGRight.getcostLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x10]),costNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGRight.getbalLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x50]),balNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port); 
					
					/*Time till full*/
					timetillfullNow = Buffer.from((liveDMGRight.gettimetillfullLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x90]),timetillfullNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Live current*/
					currNow = Buffer.from((liveDMGRight.getcurrLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x70]),currNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Live volt*/
					voltNow = Buffer.from((liveDMGRight.getvoltLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x90]),voltNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Charging mode*/
					if(data.getcProfile() == 1){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x84,0x00,0x8E]),port);
					}
					else if(data.getcProfile() == 2){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x86,0x00,0x90]),port);
					}
					else if(data.getcProfile() == 3){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x88,0x00,0x92]),port);
					}
					else if(data.getcProfile() == 4){
						isSent = isSent + objDMG.dmgIcon(Buffer.from([0x90,0x00,0x94]),port);
					}
					else{
						dmgTurnOffAllIcons('R',port)
					}
					
					return isSent;
					break;
				
				case 6://empty page
					liveDMGRight.icon = 0
					dmgTurnOffAllIcons('R',port)
					break;
				
				case 7://charging full icon
					liveDMGRight.icon = 7
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x32,0x00,0x96]),port)
					return isSent;
					
					break;
				
				case 8:// insufficient balance
					liveDMGRight.icon = 8
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x34,0x00,0xBE]),port)
					return isSent;
					
					break;
				
				case 9:// inval card icon
					liveDMGRight.icon = 9
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x36,0x00,0xC0]),port)
					return isSent;
					
					break;
				
				case 10:// error icon
					liveDMGRight.icon = 10
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x38,0x00,0xC2]),port)
					return isSent;
					
					break;
				
				
					
				default:
					dmgTurnOffAllIcons('R',port)
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

function pageUpdateDMG(newSide,newPage,netDataL,netDataR){
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
			//console.log("DMG side L: "+newPage.toString()+" "+(liveDMGLeft.icon).toString()+"   | DMG side R: "+ (liveDMGRight.page).toString()+" "+(liveDMGRight.icon).toString()+" *")
			changeDMGPage('L',newPage,DISP.port);
			changeDMGData('L',newPage,netDataL,DISP.port);
			console.log("--L page and data changed")
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			if(liveDMGRight.getIcon() == 0){
				changeDMGPage('R',liveDMGRight.page,DISP.port);
				changeDMGData('R',liveDMGRight.page,netDataR,DISP.port);
				console.log("--L No iocons to on")
				}
			else{
				console.log("R changinf for icon")
				changeDMGPage('R',liveDMGRight.icon,DISP.port);
				changeDMGData('R',liveDMGRight.icon,netDataR,DISP.port);
				console.log("--L icons on")
			}
			
			resolve();
		}
		else if (newSide == 'R'){
			//console.log("DMG side L: "+(liveDMGLeft.page).toString()+" "+(liveDMGLeft.icon).toString()+" * | DMG side R: "+ newPage.toString()+" "+(liveDMGRight.icon).toString())
			changeDMGPage('R',newPage,DISP.port);
			changeDMGData('R',newPage,netDataR,DISP.port);
			console.log("--R page and data changed")
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			if(liveDMGLeft.getIcon() == 0){
				changeDMGPage('L',liveDMGLeft.page,DISP.port);
				changeDMGData('L',liveDMGLeft.page,netDataL,DISP.port);
				console.log("--R No iocons to on")
			}
			else{
				console.log("L changinf for icon")
				changeDMGPage('L',liveDMGLeft.icon,DISP.port);
				changeDMGData('L',liveDMGLeft.icon,netDataL,DISP.port);
				console.log("--R icons on")
			}
			
			
			
			resolve();
		}
	}).catch((err)=>{ 
	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
	console.error(err)})
	
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

/*
function pageUpdateDMG(newSide,newPage,netDataL,netDataR){
	return updateDisplayDMG(newSide,newPage,netDataL,netDataR);
}*/


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

module.exports = {readMCUData,writeMCUData,pageUpdateDMG,newTap,gpio,mcuMonitor}





