/*
This module read and strip data from a given 20byte fix serial data buffer
*/

const {crc16} = require('easy-crc');
var conv = require('hex2dec');

/*MCU communication variables*/
var totalBufIn = Buffer.alloc(20);
var dataBufIn = Buffer.alloc(15);
var checksmIn = Buffer.alloc(2);
var msgIdIn = 0;
var totalBufOut = Buffer.alloc(20);
var selectContBufOut = Buffer.alloc(1);
var dataBufOut = Buffer.alloc(14);
var checksmOut = Buffer.alloc(2);


//Data from MCU - mode 1
class DataMcuM0 {
	constructor(volt,curr,powr){
		this.volt = volt;
		this.curr = curr;
		this.powr = powr;
    }
	getData(){
		return [this.volt,this.curr,this.powr,'0'];
		}  
};

//Data from MCU - mode 2
class  DataMcuM1{
	constructor(kwh,t1,t2,t3){
		this.kwh = kwh;
		this.t1 = t1;
		this.t2 = t2;
		this.t3 = t3;
		}
		getData(){
			return [this.kwh,this.t1,this.t2,this.t3];
			}
};

class StateMcuL2{
	constructor(stateL2){
		this.stateL2 = stateL2
	}
	getStateL2(){
		return this.stateL2
	}
	
}

var mcuDataM0 = new DataMcuM0(0.0,0.0,0.0);
var mcuDataM1 = new DataMcuM1(0.0,0,0,0);
var mcuStateL2 = new StateMcuL2(0);


/*
This fucntion updates class DataMcuM0 and DataMcuM1

Input = 20 byte serial input as a buffer


*/
function mcuMsgDecode(buf){
	totalBufIn = buf;
	
	try{
		if(totalBufIn.slice(0,1).toString('hex') == '23'){
			checksmIn = conv.hexToDec(totalBufIn.slice(16,18).swap16().toString('hex'));
			dataBufIn = totalBufIn.slice(1,16);
			msgIdIn = conv.hexToDec(totalBufIn.slice(9,10).toString('hex'));
			console.log(dataBufIn);
			if(conv.hexToDec(crc16('MODBUS',dataBufIn).toString(16)) == checksmIn){
				//console.log("CRC PASSED");
				mcuStateL2.stateL2 = conv.hexToDec(dataBufIn.slice(0,1)) 
				//console.log(dataBufIn.slice(0,1))
				
				if(msgIdIn == 0){
					mcuDataM0.volt = conv.hexToDec(totalBufIn.slice(10,12).swap16().toString('hex'));
					mcuDataM0.curr = conv.hexToDec(totalBufIn.slice(12,14).swap16().toString('hex'));
					mcuDataM0.powr = conv.hexToDec(totalBufIn.slice(14,16).swap16().toString('hex')); 
					} 
				else if(msgIdIn == 1){
					mcuDataM1.kwh = conv.hexToDec(totalBufIn.slice(10,12).swap16().toString('hex'));
					mcuDataM1.t1 = conv.hexToDec(totalBufIn[12].toString(16));
					mcuDataM1.t2 = conv.hexToDec(totalBufIn[13].toString(16));
					mcuDataM1.t3 = conv.hexToDec(totalBufIn[14].toString(16));			   
					}
			}
			else{
				console.log("CRC FAIL"); 
			}
		}
		
		
		
	}
	catch(error){
		console.error(error);
		return -1
	}
		
	return 0;
}

function mcuMsgEncode(controller,state,port,parser){
	
	
	switch(controller){
		/*cosntruct 1 byte of master, who talks to M and m*/
		case 'M':selectContBufOut = Buffer.from([0x4D]);break;
		case 'm':selectContBufOut = Buffer.from([0x6D]);break;
		default:selectContBufOut = Buffer.from([0x4D]);break;
	}
	
	switch(state){
		/*construct 14 bytes*/
		case 'A':dataBufOut = Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		case 'B':dataBufOut = Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		case 'C':dataBufOut = Buffer.from([0x43,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		case 'D':dataBufOut = Buffer.from([0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		case 'E':dataBufOut = Buffer.from([0x45,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		case 'F':dataBufOut = Buffer.from([0x46,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
		default:dataBufOut = Buffer.from([0x46,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);break;
	}
	
	/*Get the checksm of 15 bytes of msg. starting from C----- */
	checksmOut = crc16('MODBUS',Buffer.concat([selectContBufOut,dataBufOut],15));
	totalBufOut= Buffer.concat([Buffer.from([0x23]),selectContBufOut,dataBufOut, Buffer.from(checksmOut.toString(16).padStart(4,'0'),'hex').swap16(),Buffer.from([0x2a,0x0a])],20);
	//console.log("Req data from L2(M): ", totalBufOut);
	try{
		port.write(totalBufOut, function(err) {
			if (err) {
				return console.log('Error on write: ', err.message)
				} 
				//console.log(totalBufOut.toString('hex'));
			});
		}
	
	catch(error){
		console.error(error);
		return -1
		}
	return 0;
}

/*

function dmgt1MsgEncode(page,data,port,parser){
	switch(page){
		case '00':totalBuftoDMG = Buffer.from([0x5A,0xA5,0x07,0x82,0x00,0x84,0x5A,0x01,0x00,0x00]);break;
		case '01':totalBuftoDMG = Buffer.from([0x5A,0xA5,0x07,0x82,0x00,0x84,0x5A,0x01,0x00,0x0A]);break;
		default:
			totalBuftoDMG = Buffer.from([0x5A,0xA5,0x07,0x82,0x00,0x84,0x5A,0x01,0x00,0x00]);
			break;
	}
	
	console.log(totalBuftoDMG);
	try{
		port.write(totalBuftoDMG, function(err) {
			if (err) {
				return console.log('Error on write: ', err.message)
				} 
				//console.log(totalBufOut.toString('hex'));
			});
		}
	
	catch(error){
		console.error(error);
		return -1
		}
	return 0;
	
}
*/

function getMCUData(what){
	switch(what){
		case 'msgId0':
			return mcuDataM0.getData();break;
		case 'msgId1':
			return mcuDataM1.getData();break;
		case 'stateL2' :
			return mcuStateL2.getStateL2();break;
		default :
			return [0,0,0,0];break;
			
	}
}

module.exports = {mcuMsgDecode,mcuMsgEncode,getMCUData};
