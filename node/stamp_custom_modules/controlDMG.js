/* Conreolling DMG Display*/
/*DMG display communication variables*/
var totalBuftoDMG = Buffer.alloc(10);

function dmgPageChangeMsg(page,port){
	const pageBuf = Buffer.from(page.toString(16).padStart(2,'0'),'hex');
	const pageSwBuf = Buffer.from([0x5A,0xA5,0x07,0x82,0x00,0x84,0x5A,0x01,0x00]);
	totalBuftoDMG = Buffer.concat([pageSwBuf,pageBuf],10);
	
	return sendDMGMessage(totalBuftoDMG,port);
	
}

function dmgCIDChangeMsg(data,port){
	totalBuftoDMG = Buffer.concat([Buffer.from([0x5A,0xA5,0x08,0x82]),data],11);
	return sendDMGMessage(totalBuftoDMG,port);
}

function dmgDataChangeMsg(data,port){
	totalBuftoDMG = Buffer.concat([Buffer.from([0x5A,0xA5,0x05,0x82]),data],8);
	
	return sendDMGMessage(totalBuftoDMG,port);
}

function dmgUsernameMsg(data,len,port){
	const lenBuf = Buffer.from(len.toString(16).padStart(2,'0'),'hex')
	totalBuftoDMG = Buffer.concat([Buffer.from([0x5A,0xA5]),lenBuf,Buffer.from([0x82]),data],6+len);
	
	return sendDMGMessage(totalBuftoDMG,port);
}

function dmgIcon(data,port){
	totalBuftoDMG = Buffer.concat([Buffer.from([0x5A,0xA5,0x05,0x82,0x20]),data],8)
	//console.log(totalBuftoDMG)
	return sendDMGMessage(totalBuftoDMG,port);
}



function sendDMGMessage(sendBuf,port){
	//console.log(sendBuf,port.path,port.baudRate);
	
	try{
		port.write(sendBuf, function(err) {
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

module.exports = {dmgPageChangeMsg,dmgCIDChangeMsg,dmgDataChangeMsg,dmgUsernameMsg,dmgIcon}