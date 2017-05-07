'use strict';
var Alexa = require('alexa-sdk');
var appId = 'amzn1.ask.skill.a-long-number-you-get-from-developer.amazon.com';
var dynamoDBTableName = 'theNameOfATable';

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler (event, context);
    alexa.appId = appId;
    alexa.dynamoDBTableName = dynamoDBTableName;
    alexa.registerHandlers (handlers, listenModeHandlers, answerModeHandlers);
    alexa.execute ();
};

/**
 * Constants. Can be placed in a require file, later
 */
var states = {
    STARTMODE   : '_START',
    LISTENMODE  : '_LISTENING',
    ANSWERMODE  : '_ANSWERING'
};

var URL = 'https://somewhere.com/api/flights/';
var Client = require('node-rest-client').Client;
var apiClient = new Client();
apiClient.registerMethod ('getFlightStatusMethod', URL + '${flightID}', "GET");

/**
 * Example airline to IATA code mapping, when user speaks in words not IATA codes.
 */
var AIRLINES = {
    'british airways': 'BA',
    'klm': 'KL',
    'lufthansa': 'LH'
};

/**
 * Reverse mapping, when user speaks in IATA codes not words.
 */
var IATACODES = {
    'BA': 'british airways',
    'KL': 'klm',
    'LH': 'lufthansa'
};


/**
 * These handlers do not belong to a state. Can be actuated by new session with intent.
 */
 
var handlers = {
    'NewSession' : function () {
        var message = 'Ask me about your flight. ';
        this.handler.state = states.LISTENMODE;
        console.log (this.event);
        if (this.event.request.type == 'IntentRequest') {
            this.emit(this.event.request.intent.name);
        } else {
            this.emit (':ask', message, message );
        }
    },
    'AMAZON.CancelIntent' : function () {
        // Add any cancel specific cleanup actions
        this.emit (':tell', 'Ok. Goodbye.');
    },
    'AMAZON.StopIntent' : function () {
        // Add any stop specific clean up actions
        this.emit(':tell', 'Ok. Goodbye.');
    },
    'AMAZON.HelpIntent' : function () {
        var message = 'If you\'ve already discussed a particular flight with me, I can refer to that, otherwise ' +
            'you can ask me about a new flight. To hear which airlines I know about, ask which airlines are supported. ' +
            'Ask me about your flight, or about a new flight.';
        this.emit (':ask', message);
    },
    'SupportedAirlinesIntent' : function () {
        var message = 'Currently, I know flight information for these airlines: ' + getAllAirlinesText();
        this.emit (':ask', message);
    },
    'FinalResponseIntent' : function () {
        this.handler.state = states.ANSWERMODE;
        this.emitWithState('FinalResponseIntent');
    },
    'FlightDialogIntent' : function () {
        this.handler.state = states.ANSWERMODE;
        this.emitWithState('FlightDialogIntent');
    },
    'ResetSessionIntent' : function () {
        // Clear up persistence
        this.emit(':tell', 'I have forgotten you already.');
    },
    'Unhandled' : function () {
        this.emit(':tell', 'I\'m not really ready to talk about that.');
    },
    'SessionEndedRequest': function () {
        console.log('session ended!');
        this.emit(':saveState', true);
    }
};

/**
 * These handlers either belong to a state or will change the conversation state as it proceeds.
 * They can also call out to handlers not bound to a state, or call handlers in other states while switching
 * to that new state.
 */
 

/**
 * All the event handlers when the system is in mode LISTENMODE
 */
var listenModeHandlers = Alexa.CreateStateHandler(states.LISTENMODE, {
    'NewSession' : function () {
        this.emit('NewSession');
    },
    'LaunchRequest' : function () {
        this.emit('NewSession');
    },
    'FinalResponseIntent' : function () {
        // No slots were present, so this is an open question
        this.handler.state = states.ANSWERMODE;
        this.emitWithState('FinalResponseIntent');
    },
    'AMAZON.HelpIntent' : function () {
        this.emit('AMAZON.HelpIntent');
    },
    'SupportedAirlinesIntent' : function () {
        this.emit('SupportedAirlinesIntent');
    },
    'AMAZON.StopIntent' : function () {
        this.emit('AMAZON.StopIntent');
    },
    'AMAZON.CancelIntent' : function () {
        this.emit('AMAZON.CancelIntent');
    },
    'ResetSessionIntent' : function () {
        this.emit('ResetSessionIntent');
    },
    'FlightDialogIntent' : function () {
        // User asks with two slots, carrier and flight, go to ANSWER MODE.
        this.handler.state = states.ANSWERMODE;
        this.emitWithState('FlightDialogIntent');
    },
    'Unhandled' : function () {
        this.emit(':tell', 'I\'m not ready to talk about that just yet.');
    },
    'SessionEndedRequest': function () {
        console.log('session ended!');
        this.emit(':saveState', true);
    }
});
    
var answerModeHandlers = Alexa.CreateStateHandler(states.ANSWERMODE, {
    'FinalResponseIntent' : function () {
        /**
         * - No slots were provided and we have already persisted the flight details from a previous session.
         * - No slots were provided and we do not have the persisted flight details from a previous session.
         */
        var message = 'I do not have enough information to answer that question.';
        var prompt  = 'Don\t forget to let me know the airline and flight number details when you ask me.';
        
        if (this.attributes['airlineCode'] && this.attributes['flightNumber']) {
            handleFinalResponse(this, this.attributes['airlineCode'], this.attributes['flightNumber']);
        } else {
            this.handler.state = states.LISTENMODE;
            this.emit(':ask', message, prompt);
        }
    },
    'FlightDialogIntent' : function () {
        /**
         * The intent includes two slots.
         * Logic:
         *      Overwrite the persisted airline code, if the intent includes it and it's valid, otherwise go to LISTENMODE.
         *      Overwrite the persisted flight number.
         *      Call the demonstrator API and parse out the response and play it back in tell mode, leave the state in LISTENMODE
         */
         var carrierInfo = getCarrierCodeFromIntent(this.event.request.intent);
         if (carrierInfo.error) {
             this.handler.state = states.LISTENMODE;
             this.emit (':ask', 'Sorry, I didn\'t recognize that airline name or code. ', 'You can ask me which airlines I know about.');
             return;
         }
         
         var flightNumber = parseInt(this.event.request.intent.slots.FlightNumber.value, 10);
         
         // Save the new parameters
         
         this.attributes['airlineCode'] = carrierInfo.airlineCode;
         this.attributes['flightNumber'] = flightNumber;
         
         // Call the demonstrator API
         handleFinalResponse(this, carrierInfo.airlineCode, flightNumber);
    },
    'SessionEndedRequest': function () {
        console.log('session ended!');
        this.emit(':saveState', true);
    }
});

/**
 * Helper functions
 */
 
function handleFinalResponse (thisThis, carrier, flight) {
    var message,
        theFlight = carrier + flight.toString(),
        theFlightNum = flight.toString(),
        args = {},
        now = new(Date);
        
    args.path       = {"flightId" : theFlight };
    args.parameters = { date : formatDate(now) };
    
    console.log(args);
    
    apiClient.methods.getFlightStatusMethod(args, function(data, httpResponse) {
        console.log(data);
        if (httpResponse.statusCode != 200) {
            message = 'Sorry, I was unable to find any information about flight ' + 
            carrier + ' ' +
            '<say-as interpret-as="digits">' + theFlightNum + '</say-as>.';
        } else {
            // Compose the message
            var scheduledDepartureDate = data.Departure.ScheduledTimeLocal.DateTime.substr(0,10),
                scheduledDepartureTime = data.Departure.ScheduledTimeLocal.DateTime.substr(11,5),
                actualDepartureTime    = (data.Departure.ActualTimeLocal ? (data.Departure.ActualTimeLocal.DateTime ? data.Departure.ActualTimeLocal.DateTime.substr(11,5) : scheduledDepartureTime) : scheduledDepartureTime),
                //flightStatus = data.Departure.TimeStatus.Code, //data.FlightStatus.Code,
                timeStatus = data.Departure.TimeStatus.Code,   //(flightStatus=='Cancelled' ? 'CN' : data.Departure.TimeStatus.Code),
                terminal = (data.Departure.Terminal.Name ? data.Departure.Terminal.Name : null),
                gate     = (data.Departure.Terminal.Gate ? data.Departure.Terminal.Gate : null);
                terminal = (terminal=='Unknown' ? null : terminal);
                gate     = (gate=='Unknown' ? null : gate);
                message = 'Your flight ' + carrier +  ssmlSayDigits(theFlightNum) +
                          ' with scheduled departure on ' + ssmlSayDate(scheduledDepartureDate.substr(5,5), 'md') + ' at ' + ssmlSayTime(scheduledDepartureTime);
            switch(timeStatus) {
                case 'OT':
                    message += ', is currently on time. ';
                    message += (gate ? 'Boarding will be at gate ' + ssmlSayAsCardinal(gate) + ',' : '');
                    message += (terminal ? 'Departure will be from terminal ' + terminal : '');
                    break;
                case 'DL':
                    message += ', has been delayed until ' + ssmlSayTime(actualDepartureTime) + '. ';
                    message += (gate ? 'Boarding will be at gate ' + ssmlSayAsCardinal(gate) + ',' : '');
                    message += (terminal ? 'Departure will be from terminal ' + terminal : '');
                    break;
                case 'CN':
                    message += ', has been cancelled. ';
                    break;
                case 'EA':
                    message += ', could depart earlier than expected at, ' + ssmlSayTime(actualDepartureTime) + ', give yourself plenty of time.';
                    message += (gate ? 'Boarding will be at gate ' + ssmlSayAsCardinal(gate) + ',' : '');
                    message += (terminal ? 'Departure will be from terminal ' + terminal : '');
                    break;
                case 'AR':
                    message += ', has already arrived at the destination. Looks like you missed that one.';
                    break;
                case 'FE':
                    message += ', departed earlier than scheduled. I hope you weren\'t hoping to catch it. ';
                    break;
                default:
                    message += ', has a reported status that I don\'t properly understand.';
            } 
        }
    thisThis.handler.state = states.LISTENMODE;
    thisThis.emit(':saveState');
    thisThis.emit(':tell', message);
    });
}

function ssmlSayDate (dateString, format) {
    return '<say-as interpret-as="date" format="' + format + '">' + dateString + '</say-as>';
}

function ssmlSayTime (timeString) {
    return '<say-as interpret-as="time">' + timeString + '</say-as>';
}

function ssmlSayDigits (aNumber) {
    return '<say-as interpret-as="digits">' + aNumber.toString() + '</say-as>'; //aNumber can be integer, decimal, or string
}

function ssmlSayAsCardinal (aString) {
    return '<say-as interpret-as="cardinal">' + aString + '</say-as>';
}

function getAllAirlinesText() {
    var airlineList = '';
    for (var airline in AIRLINES) {
        airlineList += airline + ", ";
    }
    return airlineList;
}

function getCarrierCodeFromIntent(intent) {
    var airlineSlot = intent.slots.CarrierCode;
    
    if (!airlineSlot || !airlineSlot.value) {
        return { error: true };
    }
    
    var airlineName = airlineSlot.value;
    
    if (AIRLINES[airlineName.toLowerCase()]) {
        return {
            airline: airlineName,
            airlineCode: AIRLINES[airlineName.toLowerCase()]
        };
    }
    
    if (IATACODES[airlineName.toUpperCase()]) {
        return {
            airline: IATACODES[airlineName.toUpperCase()],
            airlineCode: airlineName.toUpperCase()
        };
    }
    
    return {
        error: true,
        airline: airlineName
    };
}

function formatDate(d) {
  var dd = d.getDate();
  if ( dd < 10 ) dd = '0' + dd;

  var mm = d.getMonth()+1;
  if ( mm < 10 ) mm = '0' + mm;

  var yy = d.getFullYear();
  if ( yy < 10 ) yy = '0' + yy;

  return yy+'-'+mm+'-'+dd;
}

