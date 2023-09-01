/***************************************
ChargeNET 
Middleman Features
08.31.2023

SoM custom packages:
Middleman 1.6
	+-mcuMsgHandle3
	+-controlDMG
	+-networkCheck
	+-tapcardGet
****************************************/

1. PAGE CHANGE of HT1622 Display------------------------

    > pageChange(state)
	
	input => state
			integer of {66-75}
	output => none
	
	Description:
		Changing the page of the ht1622 display and stay.This fucntion should called once. When the display chnages to page 73(charging), the page refresh ever 900ms taking the latest values. 
			
		67,Last CHARGE  "wifi":3, "heat": 1                                      
		68,VERIFYING    "kwh":21.1,"cost":500.00,"time":7568,"wifi":3, "heat": 1                       
		69,LOADING      "id":"C8689","wifi":3, "heat": 1                                               
		70,LOADING      "wifi":3, "heat": 1                                                           
		71,FAILED       "id":"F0900","wifi":3, "heat": 1                                              
		72,PLUG EV      "id":"A0090", "bal":8000,"time":8400,"wifi":3, "heat": 1             
		73,CHARGING     "id":"H0890","cur":21.3,"kwh":24.1,"cost":10000.50,timer:1,"wifi":3, "heat": 1 
		74,UNPLUG EV    "id":"A0990","kwh":88.9,"cost":90000.98,"time":256400,"wifi":3, "heat": 1    
		75,ERROR        "id":"F7890","kwh":40.7,"cost":9087,"time":89769,"error":92,"wifi":3, "heat": 1 
		76,WARNING		"id":"F0989","kwh":40.7,"cost":8907,"time":6789,"warn":2,"wifi":3, "heat": 1  		
	
			
			
			
			
2. PAGE CHANGE of DMG Display--------------------------
	> pageEventEmitter.emit(side,state)
	input  => side,state
	output =>  non
	
	Description:
		emit the pageEventEmitter to chnage the page in DMG display
		
		note:
			page 5 is empty page, that we can put icons on it
		
		side
			'newpage_Left_dmg' - left
				state
					0, Last CHARGE    page 0 , no icon
					1, VERIFYING      page 1 , no icon
					2, SELECT PORT    page 2 , no icon
					3, PLUG EV        page 3 , no icon
					4, CHARGING       page 4 , no icon
					5, EMPTY          page 5 , no icon 
					6, CHARGING FULL  page 5 , + charging full icon
					7, INSUFFICIENTBL page 5 , + insufficent bal icon
					8, INVAL CARD     page 5 , + inval card icon
					9, SYS ERROR      page 5 , + sys error icon
					
		
					
			'newpage_Right_dmg' - right
				state 
					0, Last CHARGE    page 0 , no icon
					1, VERIFYING      page 1 , no icon
					2, SELECT PORT    page 2 , no icon
					3, Charg PROFILE  page 3 , no icon
					4, PLUG EV        page 4 , no icon
					5, CHARGING       page 5 , no icon
					6, EMPTY          page 6 , no icon 
					7, CHARGING FULL  page 6 , + charging full icon
					8, INSUFFICIENTBL page 6 , + insufficent bal icon
					9, INVAL CARD     page 6 , + inval card icon
				   10, SYS ERROR      page 6 , + sys error icon		


2. READ MCU DATA---------------------------------------	
	> readMCUData(mode) 
	input  => mode 
			'msgId0' - returns [voltage, current, power, 0]
			'msgId1' - returns [power,ta,t2,t3]
			
	output => [value1, value2, value3, value4] all value elemnts ae string.
	
	
	Description:
		Reading the laters attribites of the class DataMcu0 and DataMcu1 when ever user needed.
			
			note: L2 charger data should be request and get by polling L2 and FC. Any data comming from the MCU(L2 charger) through serial bus will asynchonously read and saved by the 
		
		 

3. WRITE MCU DATA---------------------------------------	
   > writeMCUData(controller,state)	
	
	input => 				
	output => if successful 0
	
	Description:
		Writing to the mcu. 
		
	
			  
4. RFID TAP CARD---------------------------------------			  
    
	object newTap from class tapCardGet
	methods, 
		getTapString() output => "x,x,x,x,x,x,x,x"
		

5. GPIO-----------------------------------------------
	GPIO pins on the board can be accessed by using an object in middleman.gpio class
	methods 
	
	object led from class gpio
	
	create(PIN,DIRECTION,VALUE)
		-Returns a promise once it is created
		-should be used inside an async fucntion with await 
		
		PIN = GPIO pin 
		DIRECTION = 'out' or 'in'
		VALUE = Intial value 
		
		eg:led.create(5,'out',0)
			
	on()
		-Turn on LED 
		eg: led.on()
	
	off()
		-Turn off LED
		eg: led.off()
		
	isOn()
		- status of a GPIO 
		- Returns a promise after reading the value 
		- should be used inside an async fucntion with await
		eg: led.isOn() 
		
	isPressed()
		- Reading the value of the Push Button( GPIO 4) which setup as an interrupt 
			by a custom kernel module(loaded from initProg.sh)
		- Returns a promise after reading the value 
		- should be used inside an async fucntion with await
		eg: button.isPressed() or cat < /proc/gpio_intr
	
	unexport()
		- Unexport the PIN
		- Returns a promise after unexporting 
		- should be used inside an async fucntion with await
	
	Blinking Led : 
		Blink the led is working async
		hronously using setTnterval
			function. The time can be set by setting the time
			of the setInterval. once it is set, any process 
			will not be blocked by the blink.
			Blink can be removed using clearInterval

		Start blinking 
			const blinkLed = setInterval(blink, 1000);
		Stop blinking
			clearInterval(blinkLed);

6. Network data save

	Left (L2)____________________________
	cid - charger ID
	lastChargePt - Last Charge Percentage
	lastTime - Last Charge Time
	lastCost - Last Charge Cost X 10
	chargerPower - Last Charge Power 
	chargerPrice - Charger Price Per KWh

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
		0 - 0ff
		1 - to 80%
		2 - to 90%
		3 - to 15 mins
		4 - to 30 mins