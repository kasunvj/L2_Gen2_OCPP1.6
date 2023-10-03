var objmcu = require("./mcuMsgHandle5");
var objnet = require("./networkCheck");
var ping = 0;
 

//https://en.m.wikipedia.org/wiki/ANSI_escape_code#Colors
function monitor(charger,netSt){
	//console.log("From mcus montitor, ",objmcu.L2charger.getData())
	let date_ob = new Date();
	// current date
	// adjust 0 before single digit date
	let date = ("0" + date_ob.getDate()).slice(-2);
	let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
	let year = date_ob.getFullYear();
	let hours = date_ob.getHours();
	let minutes = date_ob.getMinutes();
	let seconds = date_ob.getSeconds();
	
	switch (charger){
		case 'L2':
			var state = objmcu.L2charger.getState();
			var stateName= '';
			var activityState = objmcu.L2charger.getActivityState();
			var netRequest = objmcu.L2charger.getNetRequet();
			var err = objmcu.L2charger.getpowerError();
			var genErr = objmcu.L2charger.getGeneralError();
			
			console.log()
			console.log('\x1b[33m'+year+"-"+month+"-"+date+" "+hours+":"+minutes+":"+seconds+"-------------------------- \x1b[0m")
			if (state == 0)
				stateName = 'POWER ON'
			else if (state == 1)
				stateName = 'A1'
			else if (state == 2)
				stateName = 'A2'
			else if (state == 3)
				stateName = 'B1'
			else if (state == 4)
				stateName = 'B2'
			else if (state == 5)
				stateName = 'C1'
			else if (state == 6)
				stateName = 'C2'
			else if (state == 7)
				stateName = 'D'
			else if (state == 8)
				stateName = 'F'
			else if (state == 9)
				stateName = 'TEMP_STATE_F'
			else
				stateName = 'State Error'
			
			//console.log(netSt) 
			
			if(netSt == 'IDLE')
				console.log('Network State   : \x1b[94m[*] IDLE\x1b[0m [ ] PRE_START [ ] START [ ] STOP  \x1b[0m')
			else if(netSt == 'PRE_START')
				console.log('Network State   : [ ] IDLE \x1b[94m[*] PRE_START\x1b[0m [ ] START [ ] STOP  \x1b[0m')
			else if(netSt == 'START')
				console.log('Network State   : [ ] IDLE [ ] PRE_START \x1b[94m[*] START\x1b[0m [ ] STOP  \x1b[0m')
			else if(netSt == 'STOP')
				console.log('Network State   : [ ] IDLE [ ] PRE_START [ ] START \x1b[94m[*] STOP  \x1b[0m')
			else
				console.log('Network State   : [ ] IDLE [ ] PRE_START [ ] START [ ] STOP  \x1b[0m')
			
			console.log("Charger State   : "+state+'\x1b[94m '+stateName+'\x1b[0m')
			
			console.log("\x1b[32mL2 Activity state : \x1b[0m")
			console.log("  Connector State:",activityState[0])
			console.log("  CpPWM active   :",activityState[1])
			console.log("  Charging active:",activityState[2])
			
			console.log("\x1b[32mL2 Network  Request :\x1b[0m")
			if(netRequest[1]=='1')
				console.log("\x1b[96m  Update Alarm Complete \x1b[0m")
			if(netRequest[2]=='1')
				console.log("\x1b[96m  Update Complete \x1b[0m")
			if(netRequest[3]=='1')
				console.log("\x1b[96m  Charge Pause \x1b[0m")
			if(netRequest[4]=='1')
				console.log("\x1b[96m  Vehicle Check \x1b[0m")
			if(netRequest[5]=='1')
				console.log("\x1b[96m  Shedule Charge \x1b[0m")
			if(netRequest[6]=='1')
				console.log("\x1b[96m  Stop Charge \x1b[0m")
			if(netRequest[7]=='1')
				console.log("\x1b[96m  Start \x1b[0m")
			
			console.log("\x1b[32mL2 Error States   :\x1b[0m")
			if(err[0]=='1')
				console.log("\x1b[91m  Ground Fault\x1b[0m")
			if(err[1]=='1')
				console.log("\x1b[91m  Over Current Fault\x1b[0m")
			if(err[2]=='1')
				console.log("\x1b[91m  GFI Test Failed\x1b[0m")
			if(err[3]=='1')
				console.log("\x1b[91m  Stuck Contactor Error\x1b[0m")
			if(err[4]=='1')
				console.log("\x1b[91m  Not used\x1b[0m")
			if(err[5]=='1')
				console.log("\x1b[91m  Not used\x1b[0m")
			if(err[6]=='1')
				console.log("\x1b[91m  Under Voltage Error\x1b[0m")
			if(err[7]=='1')
				console.log("\x1b[91m  Over Voltage Error\x1b[0m")
			
			console.log("\x1b[32mL2 General Error   :\x1b[0m")
			if(genErr[0] == '0')
				console.log("\x1b[94m Data Comming \x1b[0m")
			if(genErr[1] == '1')
				console.log("\x1b[91m L2 is not communicating via serial1 bus\x1b[0m")
			if(genErr[2] == '1')
				console.log("\x1b[91m Some error \x1b[0m")
			if(ping == 0)
				console.log("\x1b[91m Network unavilable \x1b[0m")
			
			break;
			
			
			
		case 'FC':
			var state = objmcu.Fcharger.getState();
			var stateName= '';
			var activityState = objmcu.Fcharger.getActivityState();
			var netRequest = objmcu.Fcharger.getNetRequet();
			var err = objmcu.Fcharger.getpowerError();
			var genErr = objmcu.Fcharger.getGeneralError();
			
			console.log()
			console.log('\x1b[33m'+year+"-"+month+"-"+date+" "+hours+":"+minutes+":"+seconds+"-------------------------- \x1b[0m")
			if (state == 0)
				stateName = 'POWER ON'
			else if (state == 1)
				stateName = 'A1'
			else if (state == 2)
				stateName = 'A2'
			else if (state == 3)
				stateName = 'B1'
			else if (state == 4)
				stateName = 'B2'
			else if (state == 5)
				stateName = 'C1'
			else if (state == 6)
				stateName = 'C2'
			else if (state == 7)
				stateName = 'D'
			else if (state == 8)
				stateName = 'F'
			else if (state == 9)
				stateName = 'TEMP_STATE_F'
			else
				stateName = 'State Error'
			
			//console.log(netSt)
			
			if(netSt == 'IDLE')
				console.log('Network State   : \x1b[94m[*] IDLE\x1b[0m [ ] PRE_START [ ] START [ ] STOP  \x1b[0m')
			else if(netSt == 'PRE_START')
				console.log('Network State   : [ ] IDLE \x1b[94m[*] PRE_START\x1b[0m [ ] START [ ] STOP  \x1b[0m')
			else if(netSt == 'START')
				console.log('Network State   : [ ] IDLE [ ] PRE_START \x1b[94m[*] START\x1b[0m [ ] STOP  \x1b[0m')
			else if(netSt == 'STOP')
				console.log('Network State   : [ ] IDLE [ ] PRE_START [ ] START \x1b[94m[*] STOP  \x1b[0m')
			else
				console.log('Network State   : [ ] IDLE [ ] PRE_START [ ] START [ ] STOP  \x1b[0m')
			
			console.log("Charger State   : "+state+'\x1b[94m '+stateName+'\x1b[0m')
			
			console.log("\x1b[32mL2 Activity state : \x1b[0m")
			console.log("  Connector State:",activityState[0])
			console.log("  CpPWM active   :",activityState[1])
			console.log("  Charging active:",activityState[2])
			
			console.log("\x1b[32mL2 Network  Request :\x1b[0m")
			if(netRequest[1]=='1')
				console.log("\x1b[96m  Update Alarm Complete \x1b[0m")
			if(netRequest[2]=='1')
				console.log("\x1b[96m  Update Complete \x1b[0m")
			if(netRequest[3]=='1')
				console.log("\x1b[96m  Charge Pause \x1b[0m")
			if(netRequest[4]=='1')
				console.log("\x1b[96m  Vehicle Check \x1b[0m")
			if(netRequest[5]=='1')
				console.log("\x1b[96m  Shedule Charge \x1b[0m")
			if(netRequest[6]=='1')
				console.log("\x1b[96m  Stop Charge \x1b[0m")
			if(netRequest[7]=='1')
				console.log("\x1b[96m  Start \x1b[0m")
			
			console.log("\x1b[32mL2 Error States   :\x1b[0m")
			if(err[0]=='1')
				console.log("\x1b[91m  Ground Fault\x1b[0m")
			if(err[1]=='1')
				console.log("\x1b[91m  Over Current Fault\x1b[0m")
			if(err[2]=='1')
				console.log("\x1b[91m  GFI Test Failed\x1b[0m")
			if(err[3]=='1')
				console.log("\x1b[91m  Stuck Contactor Error\x1b[0m")
			if(err[4]=='1')
				console.log("\x1b[91m  Not used\x1b[0m")
			if(err[5]=='1')
				console.log("\x1b[91m  Not used\x1b[0m")
			if(err[6]=='1')
				console.log("\x1b[91m  Under Voltage Error\x1b[0m")
			if(err[7]=='1')
				console.log("\x1b[91m  Over Voltage Error\x1b[0m")
			
			console.log("\x1b[32mL2 General Error   :\x1b[0m")
			if(genErr[0] == '1')
				console.log("\x1b[91m L2 is not communicating via serial1 bus\x1b[0m")
			if(genErr[1] == '1')
				console.log("\x1b[91m Some error \x1b[0m")
			if(ping == 0)
				console.log("\x1b[91m Network unavilable \x1b[0m")
			
			break;
	}
	
}

let serialIncheckID = setInterval(()=>{
	ping = objnet.netwrokStatusGet()
	},4000);
module.exports = {monitor}