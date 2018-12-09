const dgram = require('dgram');
const encryptionService = require('./encryptionService')();
const cmd = require('./commandEnums');

/**
 * Class representing a single connected device
 */
class Device {
    /**
     * Create device model and establish UDP connection with remote host
     * @param {object} [options] Options
     * @param {string} [options.address] HVAC IP address
     * @callback [options.onStatus] Callback function run on each status update
     * @callback [options.onUpdate] Callback function run after command
     * @callback [options.onConnected] Callback function run once connection is established
     */
    constructor(options) {
        this.socket = dgram.createSocket({type: 'udp4', reuseAddr: true});
        //  Set defaults
        this.options = {
            host: options.host,
            onStatus: options.onStatus || function() {},
            onUpdate: options.onUpdate || function() {},
            onConnected: options.onConnected || function() {},
            onError: options.onError || function() {},
            onDisconnected: options.onDisconnected || function() {},
            updateInterval: options.updateInterval || 10000,
            port: 8000 + parseInt(options.host.split('.')[3]),
        };

        console.log("[GreeAC]: init deviceFactory on host %s [server port %s]", this.options.host, this.options.port);
        console.log(this.options);

        this.device = {};

        // Initialize connection and bind with device
        this._connectToDevice(this.options.host, this.options.port);

        // Handle incoming messages
        this.socket.on('message', (msg, rinfo) => this._handleResponse(msg, rinfo));
    }

    /**
     * Initialize connection
     * @param {string} address - IP/host address
     * @param {int} port
     */
    _connectToDevice(address, port) {
        try {
            this.socket.bind(port, "0.0.0.0", () => {
                const message = new Buffer(JSON.stringify({t: 'scan'}));
                this.socket.setBroadcast(false);
                console.log("[GreeAC]: connecting to %s [using source port %d]", address, port);
                this.socket.send(message, 0, message.length, 7000, address);
            });
        } catch (err) {
            console.log("[GreeAC]: _connectToDevice error - port %d %s", port, err);
            const timeout = 5;
            this.options.onDisconnected(this.device);
            setTimeout(() => {
                this._connectToDevice(address, port);
            }, timeout * 1000);
        }
    }

    /**
     * Register new device locally
     * @param {string} id - CID received in handshake message
     * @param {string} name - Device name received in handshake message
     * @param {string} address - IP/host address
     * @param {number} port - Port number
     */
    _setDevice(id, name, address, port) {
        this.device.id = id;
        this.device.name = name;
        this.device.address = address;
        this.device.port = port;
        this.device.bound = false;
        this.device.props = {};
        console.log('[GreeAC] New device added: %s - %s', this.device.name, this.device.address);
    }

    /**
     * Send binding request to device
     * @param {Device} device Device object
     */
    _sendBindRequest(device) {
        const message = {
            mac: this.device.id,
            t: 'bind',
            uid: 0
        };
        const encryptedBoundMessage = encryptionService.encrypt(message);
        const request = {
            cid: 'app',
            i: 1,
            t: 'pack',
            uid: 0,
            pack: encryptedBoundMessage
        };
        const toSend = new Buffer(JSON.stringify(request));
        this.socket.send(toSend, 0, toSend.length, device.port, device.address);
    }

    /**
     * Confirm device is bound and update device status on list
     * @param {String} id - Device ID
     * @param {String} key - Encryption key
     */
    _confirmBinding(id, key) {
        this.device.bound = true;
        this.device.key = key;
        console.log('[GreeAC] device is bound: %s - %s', this.device.name, this.device.key);
    }

    /**
     * Confirm device is bound and update device status on list
     * @param {Device} device - Device
     */
    _requestDeviceStatus(device) {
        var that = this;
        const message = {
            cols: Object.keys(cmd).map(key => cmd[key].code),
            mac: device.id,
            t: 'status'
        };
        this._sendRequest(message, device.address, device.port);
    }

    /**
     * Handle UDP response from device
     * @param {string} msg Serialized JSON string with message
     * @param {object} rinfo Additional request information
     * @param {string} rinfo.address IP/host address
     * @param {number} rinfo.port Port number
     */
    _handleResponse(msg, rinfo) {
        if (rinfo.address != this.options.host) {
            //console.log("We received response from %s but we are looking for %s",rinfo.address, this.options.host );
            return;
        }
        const message = JSON.parse(msg + '');
        try {
            // Extract encrypted package from message using device key (if available)
            const pack = encryptionService.decrypt(message, (this.device || {}).key);
            // If package type is response to handshake
            if (pack.t === 'dev') {
                this._setDevice(message.cid, pack.name, rinfo.address, rinfo.port);
                this._sendBindRequest(this.device);
                return;
            }

            // If package type is binding confirmation
            if (pack.t === 'bindok' && this.device.id) {
                this._confirmBinding(message.cid, pack.key);

                // Start requesting device status on set interval
                setInterval(this._requestDeviceStatus.bind(this, this.device), this.options.updateInterval);
                this.options.onConnected(this.device)
                return;
            }

            // If package type is device status
            if (pack.t === 'dat' && this.device.bound) {
                pack.cols.forEach((col, i) => {
                    this.device.props[col] = pack.dat[i];
                });
                this.options.onStatus(this.device);
                return;
            }

            // If package type is response, update device properties
            if (pack.t === 'res' && this.device.bound) {
                pack.opt.forEach((opt, i) => {
                    this.device.props[opt] = pack.val[i];
                });
                this.options.onUpdate(this.device);
                return;
            }
            this.options.onError(this.device);
        } catch (err) {
            this.options.onError(this.device);
        }
    }

    /**
     * Send commands to a bound device
     * @param {string[]} commands List of commands
     * @param {number[]} values List of values
     */
    _sendCommand(commands = [], values = []) {
        const message = {
            opt: commands,
            p: values,
            t: 'cmd'
        };
        this._sendRequest(message);
    };

    /**
     * Send request to a bound device
     * @param {object} message
     * @param {string[]} message.opt
     * @param {number[]} message.p
     * @param {string} message.t
     * @param {string} [address] IP/host address
     * @param {number} [port] Port number
     */
    _sendRequest(message, address = this.device.address, port = this.device.port) {
        const encryptedMessage = encryptionService.encrypt(message, this.device.key);
        const request = {
            cid: 'app',
            i: 0,
            t: 'pack',
            uid: 0,
            pack: encryptedMessage
        };
        const serializedRequest = new Buffer(JSON.stringify(request));
        this.socket.send(serializedRequest, 0, serializedRequest.length, port, address);
    };

    /**
     * Turn on/off
     * @param {boolean} value State
     */
    setPower(value) {
        this._sendCommand(
            [cmd.power.code],
            [value ? 1 : 0]
        );
    };

    getPower() {
        return this.device.props[cmd.power.code];
    };

    /**
     * Set temperature
     * @param {number} value Temperature
     * @param {number} [unit=0] Units (defaults to Celsius)
     */
    setTemp(value, unit = cmd.temperatureUnit.value.celsius) {
        this._sendCommand(
            [cmd.temperatureUnit.code, cmd.temperature.code],
            [unit, value]
        );
    };

    getTemp() {
        return this.device.props[cmd.temperature.code];
    };

    /**
     * Set mode
     * @param {number} value Mode value (0-4)
     */
    setMode(value) {
        this._sendCommand(
            [cmd.mode.code],
            [value]
        );
    };

    getMode() {
        return this.device.props[cmd.mode.code];
    };

    /**
     * Set fan speed
     * @param {number} value Fan speed value (0-5)
     */
    setFanSpeed(value) {
        this._sendCommand(
            [cmd.fanSpeed.code],
            [value]
        );
    };

    getFanSpeed() {
        return this.device.props[cmd.fanSpeed.code];
    };

    /**
     * Set vertical swing
     * @param {number} value Vertical swing value (0-11)
     */
    setSwingVert(value) {
        this._sendCommand(
            [cmd.swingVert.code],
            [value]
        );
    };

    getSwingVert() {
        return this.device.props[cmd.swingVert.code];
    };

    getRoomTemp() {
        return this.device.props[cmd.TemSen.code];
    };
};

module.exports.connect = function (options) {
    return new Device(options);
};

