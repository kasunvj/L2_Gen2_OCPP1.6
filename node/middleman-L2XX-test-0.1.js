/* 
Middleman-master V 0.1

to controll Fast-Charger -- Over Serial1 ttyS1
            L2 Charger   -- Over RS485   ttyS2
			DGM Display  -- Over RS 485  ttyS2
			LED Button   -- GPIO 5
			
from Inputs Tap Card     -- USB Serial    ACM0
			Network      -- Over Wifi 
							Over 4G
			Push Button  -- GPIO interrupt GPIO 4
			

*/
const mmInstant= require('./middleman-L2-1.7');



const fsmm = require('fs');
const data = fsmm.readFileSync('config-system.json','utf8');

const objC0 = JSON.parse(data).charger_sys[0]
const objC1 = JSON.parse(data).charger_sys[1]
	  
const middleman_P0 = new mmInstant.Middleman(objC0.port_type,objC0.com_protocol,objC0.baud)
//const middleman_P1 = new mmInstant.Middleman(objC1.port_type,objC1.com_protocol,objC1.baud) 


console.log("Middleman 1 ",middleman_P0.getPortX())
//console.log("Middleman 2 ",middleman_P1.getPortX())

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
var EventEmitter = require('events');
var pageEventEmitter = new EventEmitter();
var newLeft = 0;
var newRight = 0;
const fs = require('fs');


/*

Save all data from the network related to L2 charger on  NetworkDataLEFT
_NetworkDataLEFT_____________________
cid - charger ID
lastChargePt - Last Charge Percentage
lastTime - Last Charge Time
lastCost - Last Charge Cost
chargerPower - Last Charge Power
chargerPrice - Charger Price Per KWh

*/

class NetworkDataL2{
	constructor(cid,lastChargePt,lastTime,lastCost,chargerPower,chargerPrice,stateL2,errorL2){
		this.cid = cid;
		this.lastChargePt = lastChargePt;
		this.lastTime = lastTime;
		this.lastCost = lastCost;
		this.chargerPower = chargerPower;
		this.chargerPrice = chargerPrice;
		this.stateL2 = stateL2;
		this.errorL2 = errorL2;
		
		
    }
	getData(){
		return [this.lastChargePt,this.lastTime ,this.lastCost];
		}  
	getcid(){ return this.cid;}
	getlastChargePt(){return this.lastChargePt;}
	getlastTime(){return this.lastTime;}
	getlastCost(){return this.lastCost;}
	getchargerPower(){return this.chargerPower;}
	getchargerPrice(){return this.chargerPrice;}
	getStateL2(){return this.stateL2;}
	getErrorL2(){return this.errorL2;}
	
		
};


async function blink(){
	if(await led.isOn()){
		led.off();
	}
	else{
		led.on();
	}
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function gpioTest(){
	
	await led.create(5,'out',0);
	/*Push button is taken from reading the /proc/gpio_intr 
	  No need to initate it then
	*/
	await pushButton.create(4,'in',0);
	
	
	//middleman.pageChange(77);
	
	const blinkLed = setInterval(blink, 1000);
	
	
	
	while(1){
		
		if(await pushButton.isPressed()){
			console.log("*")
			await delay(500);
		}
		
		}
		
	
	
	//clearInterval(blinkLed);
	//led.off();
}

async function die(){
	let exit = await led.unexport()
	
}

/*Delay for spesific amount of time*/
function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
} 

const readLineAsync = msg => {
  return new Promise(resolve => {
    readline.question(msg, userRes => {
      resolve(userRes);
    });
  });
}

async function controllerPolling(){
	
	fs.readFile('net-state.json', 'utf8', (err, data) => {
	  if (err) {console.error(err);return;}
	  dataL.stateL2 = JSON.parse(data).net_state;
	  dataL.errorL2 = JSON.parse(data).error_state;
	});
	
	mmInstant.writeMCUData('M',dataL.getStateL2(),0,dataL.getErrorL2());
	//middleman.writeMCUData('m','A');
	
}


//====================================
//Initialization 
//====================================



var led =new mmInstant.gpio()
var pushButton = new mmInstant.gpio()

gpioTest();

let controllerPollingID = setInterval(()=>controllerPolling(),500);

let monitorID = setInterval(()=>mmInstant.mcuMonitor('M',dataL.getStateL2()),1000);



var dataL = new NetworkDataL2(9999,98,999,567.8,87,235.5,'IDLE','');


/*Graceful kill*/
process.on('SIGINT', die);
process.on('SIGTERM', die);









