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
const middleman = require('./middleman1.7');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
var EventEmitter = require('events');
var pageEventEmitter = new EventEmitter();
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

class NetworkDataRIGHT{
	constructor(cid,lastChargePt,lastTime,lastCost,chargerPower,chargerPrice,unameFirst,unameLast,ubal,cProfile){
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

async function gpioTest(){
	
	await led.create(5,'out',0);
	/*Push button is taken from reading the /proc/gpio_intr 
	  No need to initate it then
	*/
	await pushButton.create(4,'in',0);
	
	
	middleman.pageChange(77);
	
	const blinkLed = setInterval(blink, 1000);
	
	
	
	while(1){
		
		if(await pushButton.isPressed()){
			console.log("*")
			await delay(500);
		}
		
		
		newLeft = parseInt(await readLineAsync("Page L(0-5)?"));
		newRight = parseInt(await readLineAsync("Page R(0-6)?"));
		console.log("Your response was: " +parseInt(dmgSide.myLeft) +" "+parseInt(dmgSide.myRight));
		
		
		
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
	
	middleman.writeMCUData('M',dataL.getStateL2(),0,dataL.getErrorL2());
	//middleman.writeMCUData('m','A');
	
	
	
	if( newLeft !=  dmgSide.myLeft){
		
		pageEventEmitter.emit('newpage_Left_dmg',newLeft)
	}
	
	if(newRight !=  dmgSide.myRight){
		
		pageEventEmitter.emit('newpage_Right_dmg',newRight)
	}
	
}


//====================================
//Initialization 
//====================================



var led =new middleman.gpio()
var pushButton = new middleman.gpio()

gpioTest();

let controllerPollingID = setInterval(()=>controllerPolling(),500);

//let monitorID = setInterval(()=>middleman.mcuMonitor('M',dataL.getStateL2()),1000);




//+ GBT  ------------------------------------------------------------------------------------------------------------------

/*-------------------------------------
Left (L2)____________________________
cid - charger ID
lastChargePt - Last Charge Percentage
lastTime - Last Charge Time
lastCost - Last Charge Cost X 10
chargerPower - Last Charge Power 
chargerPrice - Charger Price Per KWh
stateL2 - State of L2 charger
errorL2 - error of L2 charger

Right (L2)___________________________
cid - charger ID
lastChargePt - Last Charge Percentage
lastTime - Last Charge Time
lastCost - Last Charge Cost X 10
chargerPower - Last Charge Power 
chargerPrice - Charger Price Per KWh
unameFirst - First name 
unameLast - Last Name
ubal - User balance
charging mode 
	1 - to 80%
	2 - to 90%
	3 - to 15 mins
	4 - to 30 mins
---------------------------------------*/


var dataL = new NetworkDataLEFT(9999,98,999,567.8,87,235.5,'IDLE','');
var dataR = new NetworkDataRIGHT(9999,99,999,3450.7,67,567.8,"ABCD","ABCDEFGHIJKL",199.99,1);

var dmgSide= new mySide(0,0);



let completeLscreen = middleman.pageUpdateDMG('L', parseInt(dmgSide.myLeft), dataL, dataR);
let completeRscreen = middleman.pageUpdateDMG('R', parseInt(dmgSide.myRight), dataL, dataR);
let dmgLeftID;
let dmgRightID;

pageEventEmitter.on('newpage_Left_dmg', async function(newLeft) {
	//console.log("emmiter L taken ",newLeft )
	//let completeLscreen = await middleman.pageUpdateDMG('L', parseInt(dmgSide.myLeft), dataL, dataR);
	dmgSide.myLeft = newLeft;
	
	/*add pages that require refresh constantly*/	
	if(dmgSide.myLeft == 4){
		try{
			
			clearInterval(dmgLeftID);
			dmgLeftID = setInterval(async function (){
				let completeLscreen = await middleman.pageUpdateDMG('L', dmgSide.myLeft, dataL, dataR);
			},500);
		}
		catch{
			console.log("No interval id for L side")
		}
	}
	
	else{
		//console.log("trying to kill Left Routine")
		clearInterval(dmgLeftID);
		let completeLscreen = await middleman.pageUpdateDMG('L', parseInt(dmgSide.myLeft), dataL, dataR);
	}
	
	//console.log("wrote L page")
		
})

pageEventEmitter.on('newpage_Right_dmg', async function(newRight) {
	//console.log("emmiter R taken ",newRight );
	dmgSide.myRight = newRight;
	
	//let completeRscreen = await middleman.pageUpdateDMG('R', parseInt(dmgSide.myRight), dataL, dataR);
	
    /*add pages that require refresh constantly*/	
	if(dmgSide.myRight == 5){
		try{
			
			clearInterval(dmgRightID);
			dmgRightID = setInterval(async function (){
				let completeRscreen = await middleman.pageUpdateDMG('R', parseInt(dmgSide.myRight), dataL, dataR);
			},500);
		}
		catch{
			console.log("No interval id for R side")
		}
	}
	else{
		//console.log("trying to kill Right routine")
		clearInterval(dmgRightID);
		let completeLscreen = await middleman.pageUpdateDMG('R', parseInt(dmgSide.myRight), dataL, dataR);
	}
	
	//console.log("wrote R page")
})



/*Graceful kill*/
process.on('SIGINT', die);
process.on('SIGTERM', die);









