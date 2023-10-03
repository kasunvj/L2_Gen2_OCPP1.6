const middleman = require('./middleman1.9');
const chargerData = require("./stamp_custom_modules/mcuMsgHandle5")

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
var EventEmitter = require('events');

var newLeft = 0;
var newRight = 0;
const fs = require('fs');


class mySide{
	constructor(myLeft,myRight){
		this.myLeft = myLeft
		this.myRight= myRight
	}
}


/*

Save all data from the network related to L2 charger on  NetworkDataLEFT
_NetworkDataLEFT_____________________
cid - charger ID
lastChargePt - Last Charge Percentage
lastTime - Last Charge Time
lastCost - Last Charge Cost
chargerPower - Last Charge Power
chargerPrice - Charger Price Per KWh


Save all data from the network related to GB/T charger on  NetworkDataRIGHT
_NetworkDataLEFT_____________________
cid - charger ID
lastChargePt - Last Charge Percentage
lastTime - Last Charge Time
lastCost - Last Charge Cost
chargerPower - Last Charge Power
chargerPrice - Charger Price Per KWh
unameFirst - UserName First
unameRight - User Name Last
ubal - User Balance
cProfile - User Charging profile 
*/

class NetworkDataLEFT{
	constructor(cid,lastChargePt,lastTime,lastCost,chargerPower,chargerPrice,unameFirst,unameLast,ubal,cProfile,stateL2,errorL2){
		this.cid = cid;
		this.lastChargePt = lastChargePt;
		this.lastTime = lastTime;
		this.lastCost = lastCost;
		this.chargerPower = chargerPower;
		this.chargerPrice = chargerPrice;
		this.unameFirst = unameFirst;
		this.unameLast = unameLast;
		this.ubal = ubal;
		this.cProfile = cProfile;
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

class NetworkDataRIGHT{
	constructor(cid,lastChargePt,lastTime,lastCost,chargerPower,chargerPrice,unameFirst,unameLast,ubal,cProfile,stateFC,errorFC){
		this.cid = cid;
		this.lastChargePt = lastChargePt;
		this.lastTime = lastTime;
		this.lastCost = lastCost;
		this.chargerPower = chargerPower;
		this.chargerPrice = chargerPrice;
		this.unameFirst = unameFirst;
		this.unameLast = unameLast;
		this.ubal = ubal;
		this.cProfile = cProfile;
		this.stateFC = stateFC;
		this.errorFC = errorFC;
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
	getunameFirst(){return this.unameFirst;}
	getunameLast(){return this.unameLast;}
	getubal(){return this.ubal*100;}
	getcProfile(){return this.cProfile;}
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

async function pageChangeUserInput(){
	//FOR TESTING : Page as user inputs
	while(1){
		newLeft = parseInt(await readLineAsync("Page L(0-5)?"));
		newRight = parseInt(await readLineAsync("Page R(0-6)?"));
		console.log("Your response was: " +parseInt(middleman.l2Control.page) +" "+parseInt(middleman.fcControl.page));
		}
}

async function controllerPolling(){
	
	//FOR TESTING : Reading network state
	fs.readFile('net-state.json', 'utf8', (err, data) => {
	  if (err) {console.error(err);return;}
	  dataL.stateL2 = JSON.parse(data).net_state;
	  dataL.errorL2 = JSON.parse(data).error_state;
	});
	
	//Polling
	middleman.writeMCUData('M',dataL.getStateL2(),0,dataL.getErrorL2()); //---- L2
	middleman.writeMCUData('m','',0,dataL.getErrorL2()); // ----- FC

	//FOR DEBUGGING : read L2 and FC data
	console.log("L2 Data: ",chargerData.L2charger.getData(),chargerData.L2charger.getState())
	console.log("FC Data: ",chargerData.Fcharger.getData(),chargerData.L2charger.getState())
	
	//FOR TESTING : Page emmiting
	if( newLeft !=  middleman.l2Control.page){
		middleman.pageEE.emit('L2',newLeft,dataL,dataR)
	}
	
	if(newRight !=  middleman.fcControl.page){
		middleman.pageEE.emit('FC',newRight,dataL,dataR)
	}
	
}


//==================================== 
//Initialization 
//====================================

var dataL = new NetworkDataLEFT(1111,11,11,1111,11,111,"AAAA","BBBBB",111,0,'IDLE','');
var dataR = new NetworkDataRIGHT(2222,22,22,2222,22,222,"Kasun","Payalath",222,1,'IDLE','');


middleman.pageEE.emit('L2',0,dataL,dataR)
middleman.pageEE.emit('L2',0,dataL,dataR)

pageChangeUserInput();


let controllerPollingID = setInterval(()=>controllerPolling(),1000);

//let monitorID = setInterval(()=>middleman.mcuMonitor('FC',dataL.getStateL2()),1000);

//blinking any LED
middleman.led1.blink()
middleman.led2.blink()
middleman.led3.blink()
middleman.led4.blink()










