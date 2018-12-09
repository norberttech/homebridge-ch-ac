const commands = require('./app/commandEnums');
const deviceFactory = require('./app/deviceFactory');
let Service, Characteristic;

module.exports = function (homebridge) {
    console.log(homebridge.platformAccessory);
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-ch-ac', 'CooperHunterAC', CooperHunterAC);
};

function CooperHunterAC(log, config) {
    this.log = log;
    this.name = config.name;
    this.host = config.host;
    this.serial = config.serial;
    this.updateInterval = config.updateInterval || 10000;
    this.tempSensorShift = config.tempSensorShift || 40;
    this.model = config.model || "Cooper&Hunter AC";

    log.log(config);
}

CooperHunterAC.prototype = {

    getServices: function () {
        let heaterCoolerService = new Service.HeaterCooler(this.name);

        heaterCoolerService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', this.getCurrentHeaterCoolerState.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('set', this.setTargetHeaterCoolerState.bind(this))
            .on('get', this.getTargetHeaterCoolerState.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: -100,
                maxValue: 100,
                minStep: 0.01
            })
            .on('get', this.getCurrentTemperature.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        heaterCoolerService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({
                minValue: 16,
                maxValue: 30,
                minStep: 1
            })
            .on('set', this.setTargetTemperature.bind(this))
            .on('get', this.getTargetTemperature.bind(this));

        heaterCoolerService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({
                minValue: 16,
                maxValue: 30,
                minStep: 1
            })
            .on('set', this.setTargetTemperature.bind(this))
            .on('get', this.getTargetTemperature.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingMode.bind(this))
            .on('set', this.setSwingMode.bind(this));

        heaterCoolerService
            .getCharacteristic(Characteristic.RotationSpeed)
            .setProps({
                unit: null,
                format: Characteristic.Formats.UINT8,
                maxValue: 6,
                minValue: 1,
                validValues: [1, 2, 3, 4, 5, 6] // 6 - auto
            })
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this));


        let serviceInfo = new Service.AccessoryInformation();

        serviceInfo
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Cooper&Hunter')
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);

        this.discover(heaterCoolerService);

        return [serviceInfo, heaterCoolerService];
    },

    identify: function (callback) {

        this.device.setTemp(22);
        this.log.info("identify: set temperature to 22");

        callback();
    },

    discover: function (heaterCoolerService) {

        const deviceOptions = {
            host: this.host,
            updateInterval: this.updateInterval,
            onStatus: (deviceModel) => {
                this.getActive((x, val) => {
                   heaterCoolerService
                        .getCharacteristic(Characteristic.Active)
                        .updateValue(val);
                });

                this.getTargetHeaterCoolerState((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .updateValue(val);
                });

                this.getCurrentHeaterCoolerState((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                        .updateValue(val);
                });

                this.getCurrentTemperature((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.CurrentTemperature)
                        .updateValue(val);
                });


                this.getTargetTemperature((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                        .updateValue(val);
                    heaterCoolerService
                        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                        .updateValue(val);
                });


                this.getSwingMode((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.SwingMode)
                        .updateValue(val);
                });

                this.getRotationSpeed((x, val) => {
                    heaterCoolerService
                        .getCharacteristic(Characteristic.RotationSpeed)
                        .updateValue(val);
                });

            },
            onUpdate: (deviceModel) => {
                // log.info('Status updated on %s', deviceModel.name)
            },
            onConnected: (deviceModel) => {
                if (deviceModel.bound == true) {
                    log.info('Connected to %s with IP address', deviceModel.name, deviceModel.address);
                } else {
                    log.info('Error connecting to %s with IP address %s', deviceModel.name, deviceModel.address);
                }

            },
            onError: (deviceModel) => {
                log.info('Error communicating with device %s with IP address %s', deviceModel.name, deviceModel.address);

            },
            onDisconnected: (deviceModel) => {
                log.info('Disconnected from device %s with IP address %s', deviceModel.name, deviceModel.address);

            }
        };
        log.info("Start discover device %s", deviceOptions.host);
        this.device = deviceFactory.connect(deviceOptions);
    },

    setActive: function (Active, callback, context) {
        if (this._isContextValid(context)) {
            this.device.setPower(Active === Characteristic.Active.ACTIVE ? commands.power.value.on : commands.power.value.off);
        }
        callback();
    },

    getActive: function (callback) {
        callback(null,
            this.device.getPower() === commands.power.value.off
                ? Characteristic.Active.INACTIVE
                : Characteristic.Active.ACTIVE);
    },
    getCurrentHeaterCoolerState: function (callback) {
        let mode = this.device.getMode(),
            state;

        switch (mode) {
            case commands.mode.value.cool:
                state = Characteristic.CurrentHeaterCoolerState.COOLING;
                break;
            case commands.mode.value.heat:
                state = Characteristic.CurrentHeaterCoolerState.HEATING;
                break;
            case commands.mode.value.auto:
                state = Characteristic.CurrentHeaterCoolerState.IDLE;
                break;
            default:
                state = Characteristic.CurrentHeaterCoolerState.INACTIVE;
        }

        callback(null, state);

    },
    getCurrentTemperature: function (callback) {
        callback(null, this.device.getRoomTemp() - this.tempSensorShift);
    },
    setTemperatureDisplayUnits: function (value, callback) {
        // F is unsupported
        callback(null);
    },

    getTemperatureDisplayUnits: function (callback) {
        // F is unsupported
        callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
    },

    getTargetHeaterCoolerState: function (callback) {
        let mode = this.device.getMode(),
            state;

        switch (mode) {
            case commands.mode.value.cool:
                state = Characteristic.TargetHeaterCoolerState.COOL;
                break;
            case commands.mode.value.heat:
                state = Characteristic.TargetHeaterCoolerState.HEAT;
                break;
            default:
                state = Characteristic.TargetHeaterCoolerState.AUTO;
        }
        callback(null, state);
    },

    setTargetHeaterCoolerState: function (TargetHeaterCoolerState, callback, context) {
        if (this._isContextValid(context)) {
            let mode;

            switch (TargetHeaterCoolerState) {
                case Characteristic.TargetHeaterCoolerState.HEAT:
                    mode = commands.mode.value.heat;
                    break;
                case Characteristic.TargetHeaterCoolerState.COOL:
                    mode = commands.mode.value.cool;
                    break;
                default:
                    mode = commands.mode.value.auto;
            }
            this.device.setMode(mode);
        }

        callback();
    },

    getTargetTemperature: function (callback) {
        callback(null, this.device.getTemp());
    },

    setTargetTemperature: function (TargetTemperature, callback, context) {
        if (this._isContextValid(context)) {
            this.device.setTemp(parseInt(TargetTemperature));
        }
        callback();
    },
    getSwingMode: function (callback) {
        callback(null,
            commands.swingVert.fixedValues.includes(this.device.getSwingVert())
                ? Characteristic.SwingMode.SWING_DISABLED
                : Characteristic.SwingMode.SWING_ENABLED);
    },
    setSwingMode: function (SwingMode, callback, context) {
        if (this._isContextValid(context)) {
            this.device.setSwingVert(SwingMode === Characteristic.SwingMode.SWING_DISABLED
                ? commands.swingVert.value.default
                : commands.swingVert.value.full);
        }
        callback();
    },

    getRotationSpeed: function (callback) {
        let speed = this.device.getFanSpeed();
        speed = speed === commands.fanSpeed.value.auto ? 6 : speed;

        callback(null, speed);

    },
    setRotationSpeed: function (RotationSpeed, callback, context) {
        if (this._isContextValid(context)) {
            let speed = RotationSpeed === 6 ? commands.fanSpeed.value.auto : RotationSpeed;
            this.device.setFanSpeed(speed);
        }
        callback();
    },

    _isContextValid: function (context) {
        return context !== 'fromSetValue';
    }
};


