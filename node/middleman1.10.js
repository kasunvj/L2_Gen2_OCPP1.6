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
var EventEmitter = require('events');
var obj = require("./stamp_custom_modules/mcuMsgHandle6");
var objTap = require("./stamp_custom_modules/tapcardGet");
var objNet = require("./stamp_custom_modules/networkCheck");
var objDMG = require("./stamp_custom_modules/controlDMG");
var mymonitor = require('./stamp_custom_modules/mcuMonitor'); 

/*Loding configurations*/
const fsmm = require('fs');
const data = fsmm.readFileSync('config-system.json','utf8');
const configObj = JSON.parse(data)

var gpioEE = new EventEmitter();
var pageEE = new EventEmitter();

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
const parserFixLenL2 = portL2.pipe(new ByteLengthParser({ length: 1 }));

const portFC = new SerialPort({path:FC.getPath(),baudRate:FC.getBaud()});
const parserFixLenFC = portFC.pipe(new ByteLengthParser({ length: 1 }));


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
var lastTimeH = Buffer.alloc(2);
var lastTimeM = Buffer.alloc(2);
var lastPrice = Buffer.alloc(2);
var cpower = Buffer.alloc(2);
var cprice = Buffer.alloc(2); 
var userbal = Buffer.alloc(2); 
var currency = Buffer.alloc(3);

/*Charger Data - Live*/
var battNow = Buffer.alloc(2);
var kwhNow = Buffer.alloc(2);
var costNow = Buffer.alloc(2);
var balNow = Buffer.alloc(2);
var timetillfullNow = Buffer.alloc(2);
var currNow = Buffer.alloc(2);
var voltNow = Buffer.alloc(2);
var ecode = Buffer.alloc(2);

/*L2 data event emmiter - if needed */
var L2dataEmitter = new EventEmitter();





//========================================
//Internal function used by this module
//========================================

class LiveDataLEFT{ 
	constructor(page,icon,kwhLive,battPLive,costLive,balLive,timetillfullLive,currLive,voltLive,wattLive,ecode){
		this.page = page;
		this.icon = icon;
		this.kwhLive = kwhLive;
		this.battPLive = battPLive;
		this.costLive = costLive;
		this.balLive = balLive;
		this.timetillfullLive = timetillfullLive;
		this.currLive = currLive;
		this.voltLive = voltLive;
		this.wattLive = wattLive;
		this.ecode = ecode;
		
	}
	getPage(){ return this.page;}
	getIcon(){ return this.icon;}
	getkwhLive(){return this.kwhLive;}
	getbattPLive(){return this.battPLive;} 
	getcostLive(){return this.costLive;}
	getbalLive(){return this.balLive;}
	gettimetillfullLive(){return this.timetillfullLive;}
	getcurrLive(){return this.currLive;}
	getvoltLive(){return this.voltLive;}
	getwattLive(){return this.wattLive;}
	getEcode(){return this.ecode;}
	
	
}

class LiveDataRIGHT{
	constructor(page,icon,kwhLive,battPLive,costLive,balLive,timetillfullLive,currLive,voltLive,wattLive,ecode){
		this.page = page;
		this.icon = icon;
		this.kwhLive = kwhLive;
		this.battPLive = battPLive;
		this.costLive = costLive;
		this.balLive = balLive;
		this.timetillfullLive =timetillfullLive;
		this.currLive = currLive;
		this.voltLive = voltLive;
		this.wattLive = wattLive;
		this.ecode = ecode;
	}
	getPage(){ return this.page;}
	getIcon(){ return this.icon;}
	getkwhLive(){return this.kwhLive;}
	getbattPLive(){return this.battPLive;} 
	getcostLive(){return this.costLive;}
	getbalLive(){return this.balLive;}
	gettimetillfullLive(){return this.timetillfullLive;}
	getcurrLive(){return this.currLive;}
	getvoltLive(){return this.voltLive;}
	getwattLive(){return this.wattLive;}
	getEcode(){return this.ecode;}

}

class CommonSig{
	constructor(emg){
		this.emg = emg
	}
}

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 
	

function listenTapCard(){
	console.log('open-tap');
	parserReadLn.on('data',function(data){
		
		newTap.tapString = objTap.tapcardNoGet(data);
		newTap.tap = 1;
		gpioEE.emit('tap',newTap.getTapString())
		//console.log(tapcardString);
		
	});
}

function readMCUL2(){
	console.log('opened L2');
	parserFixLenL2.on('data', function(data){
		//console.log('\x1b[96m')
		if(obj.mcuMsgDecode(obj.countPacketL2,data) == 0){			
			L2dataEmitter.emit('data',obj.mcuDataM0,obj.mcuDataM1,obj.mcuStateL2)
			//nothing to be  done, calling mcuMsgDecode also save latest values
			//and update values that uses for DMG Display
			//updateDisplayDMG(liveDMGLeft,liveDMGLeft);
		}
		//console.log('\x1b[0m')
		
		
	});
}

function readMCUFC(){
	console.log('opened FC');
	parserFixLenFC.on('data', function(data){
		//console.log('\x1b[95m')
		if(obj.mcuMsgDecode(obj.countPacketFC,data) == 0){ 
			if(obj.Fcharger.getpowerError()[4] == '1'){
				console.log("Emergency !!!!")
				commonSig.emg = 1;
				
				pageEE.emit('E');
			}
			
			if(commonSig.emg){
				if(obj.Fcharger.getpowerError()[4] == '0'){
					commonSig.emg = 0;
					
					pageEE.emit('L2', 0, saveLastNetDataL, saveLastNetDataR)
					pageEE.emit('FC', 0, saveLastNetDataL, saveLastNetDataR)
				}
			}
			
			//middleman.pageEE.emit('L2',0,dataL,dataR)
			//L2dataEmitter.emit('data',obj.mcuDataM0,obj.mcuDataM1,obj.mcuStateL2)
			//nothing to be  done, calling mcuMsgDecode also save latest values
			//and update values that uses for DMG Display
			//updateDisplayDMG(liveDMGLeft,liveDMGLeft);
		}
		//console.log('\x1b[0m')
		
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
	                         4G = '4G '
	*/
	networkStrength = objNet.networkStrengthGet('WIFI');
	
}




//========================================
//Functions exposed from this module
//========================================

class L2Ops{
	constructor(page){
		this.page = page
	}
	doOp(newPage){
		this.page = newPage
		return testfun(this.page)
	}
	
	changePage(newPage,NetDataL,NetDataR){
		this.page = newPage
		return pageUpdateDMG('L', this.page , NetDataL, NetDataR)
	}
	
	
}

class FCOps{
	constructor(page){
		this.page = page
	}
	changePage(newPage,NetDataL,NetDataR){
		this.page = newPage
		return pageUpdateDMG('R', this.page , NetDataL, NetDataR)
	}
	
}

function testfun(p){
	console.log("---------------",p)
}

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
		this.intervalID = 0;
		this.create();
	}
	
	create(){
		return new Promise((resolve) => {
			exec('echo '+(this.pin).toString()+' > /sys/class/gpio/export', (error,stdout,stderr) => {
				if(error){
					console.log(error);
					return;
				}
				else if(stderr){
					console.log(stderr);
					return;
				}
				else{
					resolve();
				}
				});
				
			}).then(() => {
				exec('echo '+this.dir+' > /sys/class/gpio/gpio'+(this.pin).toString()+'/direction', (error,stdout,stderr) => {
					
					if(error){
						return;
					}
					else{
						console.log("setting gpio "+this.pin.toString()+" as "+this.dir);
					}
					
					
					});
			});
	}
	
	on(){
		return new Promise((resolve) => {
			exec('echo 1 > /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
				if(error){
					console.log(error);
					return;
				}
				else if(stderr){
					console.log(stderr);
					return;
				}
				else{
					console.log("On : ",this.pin);
					resolve();
				}
			});
		});
	}
	
	off(){
		return new Promise((resolve) => {
			exec('echo 0 > /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
				if(error){
					console.log(error);
					return;
				}
				else if(stderr){
					console.log(stderr);
					return;
				}
				else{
					console.log("Off : ",this.pin);
					resolve();
				}
			});
		});
	}
	
	isOn(){
		
		return new Promise((resolve) => {
			exec('cat < /sys/class/gpio/gpio'+this.pin.toString()+'/value', (error,stdout,stderr) => {
				if(error){
					console.log("Error: ",error);
					return;
				}
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
	
	blink(){
		this.intervalID = setInterval(()=>this.poll(), 200)
		
	}
	
	stopBlink(){
		clearInterval(this.intervalID)
	} 
	
	
	async poll(){
		if(await this.isOn()){
			this.off();
		}
		else{
			this.on();
		}	
	}
	
	
	
	
}


async function closeGPIO(b1,b2,b3,b4,l1,l2,l3,l4){
	await l1.stopBlink()
	await l2.stopBlink()
	await l3.stopBlink()
	await l4.stopBlink()
	await l1.off();
	await l2.off();
	await l3.off();
	await l4.off();
	await delay(2000);
	await b1.unexport();
	await b2.unexport();
	await b3.unexport();
	await b4.unexport();
	await l1.unexport();
	await l2.unexport();
	await l3.unexport();
	await l4.unexport();
}

async function checkGPIO(b1,b2,b3,b4){
	if(await b1.isOn() == 0){
		gpioEE.emit('btn1')
		//console.log("Burron 1 is Pressed ")
	}
	if(await b2.isOn() == 0){
		gpioEE.emit('btn2')
		//console.log("Burron 2 is Pressed ")
	}
	if(await b3.isOn() == 0){
		gpioEE.emit('btn3')
		//console.log("Burron 3 is Pressed ")
	}
	if(await b4.isOn() == 0){
		gpioEE.emit('btn4')
		//console.log("Burron 4 is Pressed ")
	}
}

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

7 = insufficient Bal
8 = Invalid card 
9 = error

Right (GBT)
0 = IDELING
1 = AUTENDICATING
2 = PORT SELECTION
3 = CHARGING MODE
4 = PLUG-IN
5 = Charginh
6 = Full

7 = insufficient Bal
8 = Invalid card 
9 = error
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
					else if(liveDMGRight.getPage() == 3){ page = 38 ;} //<<
					else if(liveDMGRight.getPage() == 4){ page = 23 ;}
					else if(liveDMGRight.getPage() == 5){ page = 29 ;}
					else if(liveDMGRight.getPage() == 6){ page = 35 ;}
					else{ page = 0;}
					liveDMGLeft.page = 4;
					liveDMGLeft.icon = 0;
					
					break;
				
				case 5://full charge //<<
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
				/*
				case 6:// empty page to display charging full next v//<<
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
				*/
				case 6:// empty page, to display, go to please wait and [present right page]
					//Empty page open (page 1)
					if(liveDMGRight.getPage() == 0){ page = 1 ;}      // wait | Tap
					else if(liveDMGRight.getPage() == 1){ page = 7 ;} // wait | Wait
					else if(liveDMGRight.getPage() == 2){ page = 13 ;}// wait | port 
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}// wait | user
					else if(liveDMGRight.getPage() == 4){ page = 20 ;}// wait | plugin
					else if(liveDMGRight.getPage() == 5){ page = 26 ;}// wait | charging
					else if(liveDMGRight.getPage() == 6){ page = 32 ;}// wait | charged
					else{ page = 7;}
					liveDMGLeft.page = 1;
					break;
					
				case 7:// empty page to display insufficient bal
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 1 ;}
					else if(liveDMGRight.getPage() == 1){ page = 7 ;}
					else if(liveDMGRight.getPage() == 2){ page = 13 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 20 ;}
					else if(liveDMGRight.getPage() == 5){ page = 26 ;}
					else if(liveDMGRight.getPage() == 6){ page = 32 ;}
					else{ page = 7;} // wait | wait
					liveDMGLeft.page = 1; 
					liveDMGLeft.icon = 1;
					break;
				
				case 8:// empty page to display invalid card
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 1 ;}
					else if(liveDMGRight.getPage() == 1){ page = 7 ;}
					else if(liveDMGRight.getPage() == 2){ page = 13 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 20 ;}
					else if(liveDMGRight.getPage() == 5){ page = 26 ;}
					else if(liveDMGRight.getPage() == 6){ page = 32 ;}
					else{ page = 7;} // wait | wait 
					liveDMGLeft.page = 1;
					liveDMGLeft.icon = 1;
					break;
				
				case 9:// empty page to display sys error
					//Empty page open (page 5)
					if(liveDMGRight.getPage() == 0){ page = 1 ;}
					else if(liveDMGRight.getPage() == 1){ page = 7 ;}
					else if(liveDMGRight.getPage() == 2){ page = 13 ;}
					else if(liveDMGRight.getPage() == 3){ page = 18 ;}
					else if(liveDMGRight.getPage() == 4){ page = 20 ;}
					else if(liveDMGRight.getPage() == 5){ page = 26 ;}
					else if(liveDMGRight.getPage() == 6){ page = 32 ;}
					else{ page = 7;} // wait | wait
					liveDMGLeft.page = 1;
					liveDMGLeft.icon = 1;
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
					else if(liveDMGLeft.getPage() == 4){ page = 38 ;}
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
				
				case 6: // charged 
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
				// right icon landing page is 1 (wait)
					if(liveDMGLeft.getPage() == 0){ page = 6 ;}      // tap  | wait
					else if(liveDMGLeft.getPage() == 1){ page = 7 ;} // wait | wait
					else if(liveDMGLeft.getPage() == 2){ page = 8 ;} // port | wait
					else if(liveDMGLeft.getPage() == 3){ page = 9 ;} // plug | wait
					else if(liveDMGLeft.getPage() == 4){ page = 10 ;}// charg| wait
					else if(liveDMGLeft.getPage() == 5){ page = 11 ;}// ched | wait
					else{ page = 7;}
					liveDMGRight.page = 1;
					
					
					break;
				
				case 8: // empty page for insufficient bal
				// right icon landing page is 1 (wait)
					if(liveDMGLeft.getPage() == 0){ page = 6 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 7 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 8 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 9 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 10 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 11 ;}
					else{ page = 7;}
					liveDMGRight.page = 1;
					
					
					break;
				
				case 9: // empty page  for inval crd 
				// right icon landing page is 1 (wait)
					if(liveDMGLeft.getPage() == 0){ page = 6 ;}
					else if(liveDMGLeft.getPage() == 1){ page = 7 ;}
					else if(liveDMGLeft.getPage() == 2){ page = 8 ;}
					else if(liveDMGLeft.getPage() == 3){ page = 9 ;}
					else if(liveDMGLeft.getPage() == 4){ page = 10 ;}
					else if(liveDMGLeft.getPage() == 5){ page = 11 ;}
					else{ page = 7;}
					liveDMGRight.page = 1;
					
					break;
				
					
				default:
					//console.log("Right Side : FC has No such state to change page");
					console.log("Right Invalid page")
					break;
				
			}
			
			break;
		case 'E':
			switch(stateNo){
				case 10:
					page = 39;
					dmgTurnOffAllIcons('L',port)
					dmgTurnOffAllIcons('R',port)
					break;
			}
			
			
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
					cID = Buffer.from((data.getcid()).toString(16).padStart(4,'0'),'hex');
					console.log("L ",data.getcid(),cID)
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x00]),cID],4);
					isSent = isSent + objDMG.dmgCIDChangeMsg(dmgDataBuf,port); 
					
					/* Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x20]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates Power*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x40]),cpower],4);
					//console.log(dmgDataBuf)
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time H*/
					lastTimeH = Buffer.from((data.getlastTimeH()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x35]),lastTimeH],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time M*/
					lastTimeM = Buffer.from((data.getlastTimeM()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x40]),lastTimeM],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Price (Original value should X10)*/ 
					lastPrice = Buffer.from((data.getlastCost()*100).toString(16).padStart(8,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x60]),lastPrice],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x80]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Currency*/
					/*
					currency = Buffer.from(data.getCurrency(),'ascii');
					dmgDataBuf = Buffer.concat([Buffer.from([0x14,0x20]),currency],5);
					isSent = isSent + objDMG.dmgCurrencyMsg(dmgDataBuf,port);
					*/
					return isSent;
					
					break;
					
					
					
				case 4://charging  
					liveDMGLeft.icon = 0
					/*Energy kwh*/ 
					kwhNow = Buffer.from((liveDMGLeft.getkwhLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x65]),kwhNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('L',liveDMGLeft.getbattPLive(),port),port);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGLeft.getcostLive()*100).toString(16).padStart(8,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x00]),costNow],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port); 
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGLeft.getbalLive()*100).toString(16).padStart(8,'0'),'hex');
					console.log("Balnce : ",balNow,liveDMGLeft.getbalLive())
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x40]),balNow],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port); 
					
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
					
					/*Live  power*/
					wattLive = Buffer.from((liveDMGLeft.getwattLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x85]),wattLive],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					
					return isSent;
					
					break;
				
				case 5://charged full no icon to display to display 
					liveDMGLeft.icon = 0
					dmgTurnOffAllIcons('L',port)
					break;
				
				case 6://charging full icon
					liveDMGLeft.icon = 0
					/*Reove all the icons */
					//dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					//isSent = isSent + objDMG.dmgIcon(Buffer.from([0x12,0x00,0x84]),port)
					///return isSent;
					
					break;
				
				case 7:// insufficient balance
					liveDMGLeft.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x14,0x00,0xB8]),port)
					return isSent;
					
					break;
				
				case 8:// inval card icon
					liveDMGLeft.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x16,0x00,0xBA]),port)
					return isSent;
					
					break;
				
				case 9:// error icon
					liveDMGLeft.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('L',port)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x18,0x00,0xBC]),port)
					
					ecode = Buffer.from((2).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x42]),ecode],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
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
					cID = Buffer.from((data.getcid()).toString(16).padStart(4,'0'),'hex');
					console.log("R ",data.getcid(),cID)
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x10]),cID],4);
					isSent = isSent + objDMG.dmgCIDChangeMsg(dmgDataBuf,port); 
					
					/*Last Charge %*/
					lastCharge = Buffer.from((data.getlastChargePt()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x30]),lastCharge],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Charger Operates*/
					cpower = Buffer.from((data.getchargerPower()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x50]),cpower],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time H*/
					lastTimeH = Buffer.from((data.getlastTimeH()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x45]),lastTimeH],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Time M*/
					lastTimeM = Buffer.from((data.getlastTimeM()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x50]),lastTimeM],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Last Price (Original value should X10)*/
					lastPrice = Buffer.from((data.getlastCost()*100).toString(16).padStart(8,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x70]),lastPrice],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port);
					
					/* Charger Operates Price per KWh*/
					cprice = Buffer.from((data.getchargerPrice()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x90]),cprice],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Currency*/
					/*
					currency = Buffer.from(data.getCurrency(),'ascii');
					dmgDataBuf = Buffer.concat([Buffer.from([0x14,0x20]),currency],5);
					isSent = isSent + objDMG.dmgCurrencyMsg(dmgDataBuf,port);
					*/
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
					userbal = Buffer.from((data.getubal()).toString(16).padStart(8,'0'),'hex');
					console.log("User Balace:",userbal,(data.getubal()))
					dmgDataBuf = Buffer.concat([Buffer.from([0x13,0x10]),userbal],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port);
					
					/* Currency*/
					/*
					currency = Buffer.from(data.getCurrency(),'ascii');
					dmgDataBuf = Buffer.concat([Buffer.from([0x14,0x20]),currency],5);
					isSent = isSent + objDMG.dmgCurrencyMsg(dmgDataBuf,port);
					*/
					return isSent;
					break;
					
					
				case 5://CHARGING
					liveDMGRight.icon = 0
					/*Live battery %*/
					battNow = Buffer.from((liveDMGRight.getbattPLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x70]),battNow],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/*Energy kWh*/
					kwhLive = Buffer.from((liveDMGRight.getkwhLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x75]),kwhLive],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					/* Live Batt Icon*/
					isSent = isSent + objDMG.dmgIcon(getBattIcon('R',liveDMGRight.getbattPLive(),port),port);
					
					/*Live cost*/
					costNow = Buffer.from((liveDMGRight.getcostLive()*100).toString(16).padStart(8,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x10]),costNow],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port);
					
					/*Live bal*/
					balNow = Buffer.from((liveDMGRight.getbalLive()*100).toString(16).padStart(8,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x50]),balNow],6);
					isSent = isSent + objDMG.dmgLongInt(dmgDataBuf,port); 
					
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
					
					/*Live  power*/
					wattLive = Buffer.from((liveDMGRight.getwattLive()).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x12,0x95]),wattLive],4);
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
				/*
				case 7://insufficient bal
					liveDMGRight.icon = 7
					//Reove all the icons 
					dmgTurnOffAllIcons('R',port)
					//Adding icon
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x32,0x00,0x96]),port)
					return isSent;
					
					break;*/
				
				case 7:// insufficient balance
					liveDMGRight.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x34,0x00,0xBE]),port)
					return isSent;
					
					break;
				
				case 8:// inval card icon
					liveDMGRight.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x36,0x00,0xC0]),port)
					return isSent;
					
					break;
				
				case 9:// error icon
					liveDMGRight.icon = 1
					/*Reove all the icons */
					dmgTurnOffAllIcons('R',port)
					/*Adding  icon*/
					isSent = isSent + objDMG.dmgIcon(Buffer.from([0x38,0x00,0xC2]),port)
					
					ecode = Buffer.from((3).toString(16).padStart(4,'0'),'hex');
					dmgDataBuf = Buffer.concat([Buffer.from([0x11,0x44]),ecode],4);
					isSent = isSent + objDMG.dmgDataChangeMsg(dmgDataBuf,port);
					
					return isSent;
					
					break;
				
				
					
				default:
					dmgTurnOffAllIcons('R',port)
					//console.log("Right Side : FC has No such stateto update  data")
					//dmgDataBuf = Buffer.from([0x00,0x00,0x00,0x00])
					break;		
			}
		
		
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
			for (let i=14; i < 20 ;i=i+2){
				var numberString ='0x'+i.toString();
				objDMG.dmgIcon(Buffer.from([numberString,0x00,0x01]),myPort)
			}
			break; 
		case 'R':
			/*Remove all icons starting from vp number 2020 to 2040*/
			for (let i=34; i < 40 ;i=i+2){
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
	
	isAllSent = 0;
	//var liveLeftDataMid0 = readMCUData('msgId0');
	//var liveLeftDataMid1 = readMCUData('msgId1');
	
	liveDMGLeft.voltLive = parseInt(obj.L2charger.volt);
	liveDMGLeft.currLive = parseInt(obj.L2charger.curr);
	liveDMGLeft.wattLive = parseInt(obj.L2charger.powr);
	liveDMGLeft.kwhLive = parseInt(obj.L2charger.kwh);
	liveDMGLeft.battPLive = parseInt(obj.L2charger.soc);
	
	liveDMGRight.voltLive  = parseInt(obj.Fcharger.volt);
	liveDMGRight.currLive = parseInt(obj.Fcharger.curr);
	liveDMGRight.wattLive = parseInt(obj.Fcharger.powr);
	liveDMGRight.kwhLive = parseInt(obj.Fcharger.kwh);
	liveDMGRight.battPLive = parseInt(obj.Fcharger.soc);
	
	return new Promise((resolve,reject) => {
		if(newSide == 'L'){
			//console.log("DMG side L: "+newPage.toString()+" "+(liveDMGLeft.icon).toString()+"   | DMG side R: "+ (liveDMGRight.page).toString()+" "+(liveDMGRight.icon).toString()+" *")
			changeDMGPage('L',newPage,DISP.port);
			changeDMGData('L',newPage,netDataL,DISP.port);
			console.log("--L page and data changed")
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			console.log("--R icon:",liveDMGRight.getIcon())
			if(liveDMGRight.getIcon() == 0){
				console.log("R side no icon, but refreshing ")
				changeDMGPage('R',liveDMGRight.page,DISP.port);
				changeDMGData('R',liveDMGRight.page,netDataR,DISP.port);
				console.log("--R No iocons to on")
				}
			else{
				console.log("R chaning for icon")
				changeDMGPage('R',liveDMGRight.icon,DISP.port);
				changeDMGData('R',liveDMGRight.icon,netDataR,DISP.port);
				console.log("--R icons on")
			}
			
			resolve();
		}
		else if (newSide == 'R'){
			// console.log("DMG side L: "+(liveDMGLeft.page).toString()+" "+(liveDMGLeft.icon).toString()+" * | DMG side R: "+ newPage.toString()+" "+(liveDMGRight.icon).toString())
			changeDMGPage('R',newPage,DISP.port);
			changeDMGData('R',newPage,netDataR,DISP.port);
			console.log("--R page and data changed")
			/*If tehre is an icon to keep from the previous state pass the state saved in icon attribute*/
			console.log("--L icon:",liveDMGLeft.getIcon())
			if(liveDMGLeft.getIcon() == 0){
				console.log("L side no icon, but refreshing ")
				changeDMGPage('L',liveDMGLeft.page,DISP.port);
				changeDMGData('L',liveDMGLeft.page,netDataL,DISP.port);
				console.log("--L No iocons to on")
			}
			else{
				console.log("L changinf for icon")
				changeDMGPage('L',liveDMGLeft.icon,DISP.port);
				changeDMGData('L',liveDMGLeft.icon,netDataL,DISP.port);
				console.log("--L icons on")
			}
			
			
			
			resolve();
		}
		
		/*
		else if (newSide == 'E'){
			// console.log("DMG side L: "+(liveDMGLeft.page).toString()+" "+(liveDMGLeft.icon).toString()+" * | DMG side R: "+ newPage.toString()+" "+(liveDMGRight.icon).toString())
			changeDMGPage('E',newPage,DISP.port);
			console.log("--E page and data changed")
			//If tehre is an icon to keep from the previous state pass the state saved in icon attribute
			console.log("--E icon:",liveDMGLeft.getIcon())
			if(liveDMGLeft.getIcon() == 0){
				console.log("E side no icon, but refreshing ")
				changeDMGPage('E',liveDMGLeft.page,DISP.port);
				console.log("--E No iocons to on")
			}
			else{
				console.log("E changinf for icon")
				changeDMGPage('E',liveDMGLeft.icon,DISP.port);
				console.log("--E icons on")
			}
			
			
			
			resolve();
		}*/
		
		
		console.log("************************** All msg sent to display")
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
Powerlive
ecode

Right (GBT)
_________
page
icon
kwh
battlive
costLive
balLive
timetillfullLive
currLive
voltLive
powerLive
ecode
--------------------------*/
var liveDMGLeft =  new LiveDataLEFT(0,0,44,44.40,14.50,44,44,44,44,1);//L2 does not have batt but it shows as 0 here %
var liveDMGRight = new LiveDataRIGHT(0,0,55,0,55.50,15.50,55,55,55,55,1);

let saveLastNetDataL;
let saveLastNetDataR;


/*GPIO*/
let btn1, btn2, btn3, btn4, led1, led2, led3, led4

let gpioPromise = new Promise(() => {
	
})

async function gpioCreate(){
	return new Promise(async (resolve) =>{
		btn1 = await new gpio(4,'in',1);
		btn2 = await new gpio(5,'in',1);
		btn3 = await new gpio(8,'in',1);
		btn4 = await new gpio(86,'in',1);
		led1 = await new gpio(9,'out',0);
		led2 = await new gpio(11,'out',0);
		led3 = await new gpio(48,'out',0);
		led4 = await new gpio(85,'out',0);
		await delay(500)
		resolve()
	}).then(() => {
		gpioEE.emit('gpio_ready');
	})
}


/*DGM Page Initialize*/
var l2Control = new L2Ops(0)
var fcControl = new FCOps(0)
let commonSig = new CommonSig(0)

let dmgLeftID;
let dmgRightID;
let gpioID

gpioCreate()

//checking gpio using emmiter
gpioEE.on('btn1',() => {
	console.log("\x1b[33m Button 1 : Pressed \x1b[0m")})
gpioEE.on('btn2',() => {console.log("\x1b[33m Button 2 : Pressed \x1b[0m")})
gpioEE.on('btn3',() => {console.log("\x1b[33m Button 3 : Pressed \x1b[0m")})
gpioEE.on('btn4',() => {console.log("\x1b[33m Button 4 : Pressed \x1b[0m")})
gpioEE.on('tap',(string) => {console.log("\x1b[33m Tap Card : "+string+"\x1b[0m")})
gpioEE.on('gpio_ready',() => {
	console.log("GPIO setting complted");
	gpioID = setInterval(()=>checkGPIO(btn1,btn2,btn3,btn4),100);
})
gpioEE.on('led1_on',async() =>{await led1.on();})
gpioEE.on('led2-on',async() =>{await led2.on();})
gpioEE.on('led3-on',async() =>{await led3.on();})
gpioEE.on('led4-on',async() =>{await led4.on();})

gpioEE.on('led1-off',async() =>{await led1.off();})
gpioEE.on('led2-off',async() =>{await led2.off();})
gpioEE.on('led3-off',async() =>{await led3.off();})
gpioEE.on('led4-off',async() =>{await led4.off();})

gpioEE.on('all-off',() =>{
	led1.off();
	led2.off();
	led3.off();
	led4.off();})


//-----------------------------

pageEE.on('L2', async function(newLeft,dL,dR) {
	l2Control.page= newLeft;
	saveLastNetDataL = dL;
	saveLastNetDataR = dR; 
	
	/*add pages that require refresh constantly */	
	if(l2Control.page == 4){
		try{clearInterval(dmgLeftID);
			dmgLeftID = setInterval(async function (){
				let completeLscreen = await l2Control.changePage(newLeft, dL, dR);
			},500);
		}
		catch{console.log("No interval id for L side")
		}
	}
	
	else{
		//console.log("trying to kill Left Routine")
		clearInterval(dmgLeftID);
		let completeLscreen = await l2Control.changePage(newLeft, dL, dR);
	}
	
		
})
pageEE.on('FC', async function(newRight,dL,dR) {
	
	fcControl.page = newRight;
	saveLastNetDataL = dL;
	saveLastNetDataR = dR; 

    /*add pages that require refresh constantly*/	
	if(fcControl.page == 5){
		try{clearInterval(dmgRightID);
			dmgRightID = setInterval(async function (){
				let completeRscreen = await fcControl.changePage(newRight, dL, dR);
			},500);
		}
		catch{console.log("No interval id for R side")
		}
	}
	else{
		clearInterval(dmgRightID);
		let completeLscreen = await fcControl.changePage(newRight, dL, dR);
	}
	
})


pageEE.on('E',async function(){
	clearInterval(dmgLeftID);
	clearInterval(dmgRightID);
	writeMCUData('M','IDLE',0,saveLastNetDataL.getErrorL2());
	let completeLscreen = await changeDMGPage('E',10,DISP.port)
})




//========================================
// Async running functions
//========================================



/*Updating network status*/
let networkcheckID = setInterval(()=>updateNet(),5000);

/* Read from MCU L2*/
portL2.on('open',readMCUL2);  //---- L2

/* Read from MCU FC*/
portFC.on('open',readMCUFC);  // ---- FC

		
/* Read from Tap Card*/
portACM0.on('open',listenTapCard);

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

async function gracefulDead(){
	clearInterval(gpioID)
	await closeGPIO(btn1,btn2,btn3,btn4,led1,led2,led3,led4)
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
	
	releaseCIDPromise.then(bye,halfbye).catch((e) => {
		console.error(e.message);
		halfbye();
	}).finally(()=>{
		process.exit();
	});
	
}


/*Graceful kill*/
process.on('SIGINT', gracefulDead);
process.on('SIGTERM', gracefulDead);






/* TESTING : Value change */
let testID = setInterval(()=>{
	if (liveDMGLeft.getbattPLive() <= 95){
		liveDMGLeft.battPLive= liveDMGLeft.getbattPLive() +5;}
	else{
		liveDMGLeft.battPLive = 0;
	}
	/*
	if (liveDMGRight.getbattPLive() <= 95){
		liveDMGRight.battPLive = liveDMGRight.getbattPLive() +5;}
	else{
		liveDMGRight.battPLive = 0;
	}
	*/
},500);

module.exports = {readMCUData,writeMCUData,pageUpdateDMG,newTap,gpio,mcuMonitor,l2Control,fcControl,pageEE,gpioEE,led1,led2,led3,led4,commonSig}





