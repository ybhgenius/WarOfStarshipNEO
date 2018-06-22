"use strict";

let User = function (jsonStr) {
    if (jsonStr) {
        let obj = JSON.parse(jsonStr);
        for (let key in obj) {
            this[key] = obj[key];
        }
    } else {
        let rad = Math.random() * Math.PI;
        this.nickname = "";
        this.address = "";
        this.country = "";
        this.state = 0; //0:sailing 1:collecting
        this.hull = 1; //完整度
        this.expandCnt = 0;

        let locData = {};
        locData.speed = 0;
        locData.lastLocationX = Math.cos(rad) * 5000;
        locData.lastLocationY = Math.sin(rad) * 5000;
        locData.destinationX = null;
        locData.destinationY = null;
        locData.lastLocationTime = (new Date()).valueOf();

        this.rechargeOnExpand = new BigNumber(0);
        this.locationData = locData;
        this.expandMap = {
            //"-3,2": {order: 23//第几次扩建的}
        };
        this.buildingMap = {
            //"-3,2":{id:"ironcoll", lv:2, recoverTime:10302019313, justBuildOrUpgrade: true}
        };
        this.cargoData = {
            energy: 1000000,
            iron: 1000000,
        };
        this.collectingStarIndex = null;
        this.lastCalcTime = (new Date()).valueOf();
    }
};

User.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};


let BuildingInfo = function (jsonStr) {
    if (jsonStr) {
        let obj = JSON.parse(jsonStr);
        for (let key in obj) {
            this[key] = obj[key];
        }
    } else {
        this.id = 'no_id';
        this.IronCost = 1;
    }
};
BuildingInfo.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

let Island = function (jsonStr) {
    if (jsonStr) {
        let obj = JSON.parse(jsonStr);
        for (let key in obj) {
            this[key] = obj[key];
        }
    } else {
        this.index = 0;
        this.x = 0;
        this.y = 0;
        this.occupant = "";
        this.lastMineTime = 0; // 上次开始挖矿的时间
        this.army = {};
        this.money = new BigNumber(0);
        this.sponsor = "";
        this.sponsorName = "";
        this.sponsorLink = "";
        this.mineSpeed = 0.0001;
        this.mineBalance = 0;
        this.lastCalcTime = 0;
    }
};
Island.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

let BigNumberDesc = {
    parse: function (jsonText) {
        return new BigNumber(jsonText);
    },
    stringify: function (obj) {
        return obj.toString();
    }
}

let GameContract = function () {
    LocalContractStorage.defineProperty(this, "adminAddress");
    LocalContractStorage.defineProperty(this, "totalIslandCnt");
    LocalContractStorage.defineProperty(this, "totalNas", BigNumberDesc);
    LocalContractStorage.defineProperty(this, "shipSpeed");
    LocalContractStorage.defineProperty(this, "energyCostPerLyExpand");
    LocalContractStorage.defineProperty(this, "allUserList", {
        parse: function (jsonText) {
            return JSON.parse(jsonText);
        },
        stringify: function (obj) {
            return JSON.stringify(obj);
        }
    })
    LocalContractStorage.defineMapProperty(this, "allUsers", {
        parse: function (jsonText) {
            return new User(jsonText);
        },
        stringify: function (obj) {
            return obj.toString();
        }
    });
    LocalContractStorage.defineMapProperty(this, "allBuildingInfos", {

        parse: function (jsonText) {
            return JSON.parse(jsonText);
        },
        stringify: function (obj) {
            return JSON.stringify(obj);
        }
        // parse: function (jsonText) {
        //     return new BuildingInfo(jsonText);
        // },
        // stringify: function (obj) {
        //     return obj.toString();
        // }
    });
    LocalContractStorage.defineProperty(this, "allIslands", {
        parse: function (jsonText) {
            return JSON.parse(jsonText);
        },
        stringify: function (obj) {
            return JSON.stringify(obj);
        }
    });
}

GameContract.prototype = {
    init: function () {
        this.adminAddress = "n1b674BV8zHoXu8TeQhmfXqQKXX9tfPR6eN";
        this.totalNas = new BigNumber(0);
        this.shipSpeed = 100;
        this.energyCostPerLyExpand = 1;
        this.allUserList = [];
        // this.allBuildingInfos = {};
        this.allIslands = [];
    },
    getMapInfo: function () {
        let allUsers = this.allUsers;
        let users = this.allUserList.map(function (address) {
            return allUsers.get(address);
        });
        let islands = [];
        for (let i = 0; i < this.allIslands.length; i++) {
            islands.push(this.allIslands.get(i));
        }
        return {
            "success": true,
            "result_data": {
                "users": users,
                "islands": islands
            }
        };
    },
    getUserList: function () {
        return this.allUserList;
    },
    getUser: function (address) {
        return this.allUsers.get(address);
    },
    claimNewUser: function (nickname, country) {
        if (nickname.length > 100) {
            throw new Error("Nickname is too long.");
        }
        if (country.length > 20) {
            throw new Error("Country name is too long.");
        }
        let userAddress = Blockchain.transaction.from;
        let value = Blockchain.transaction.value;

        if (this.allUsers.get(userAddress) !== null) {
            throw new Error("Has claim new user before.")
        }

        this.totalNas = value.plus(this.totalNas);

        let user = new User();
        user.nickname = nickname;
        user.country = country;
        user.address = userAddress;
        this.allUsers.set(userAddress, user);
        let allUserList = this.allUserList;
        allUserList.push(userAddress);
        this.allUserList = allUserList;

        return {
            "success": true,
            "result_data": user
        };
    },
    move: function (destinationX, destinationY) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        if (destinationX === null || destinationY === null) {
            throw new Error("Parameters INVALID.");
        }
        this._recalcUser(user);
        let locData = user.locationData;
        locData.speed = this.shipSpeed;
        locData.destinationX = destinationX;
        locData.destinationY = destinationY;
        let energyCost = this.getSailEnergyCost(user);
        if (user.cargoData.energy < energyCost) {
            throw new Error("User energy NOT enough.");
        }

        user.cargoData.energy -= energyCost;
        user.state = 0;

        this.allUsers.set(userAddress, user);

        return {
            "success": true,
            "result_data": user
        };
    },
    collect: function (starIndex) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        let locData = user.locationData;

        //check star, island distance
        user.collectingStarIndex = null;
        if (starIndex) {
            let star = this.getStarInfo(starIndex);
            let dx = locData.x - star.x;
            let dy = locData.y - star.y;
            let dist = Math.sqrt(dx * dx + dy + dy);
            if (dist <= 100) {
                user.collectingStarIndex = starIndex;
            }
        }

        user.state = 1;

        this.allUsers.set(userAddress, user);

        return {
            "success": true,
            "result_data": user
        };
    },
    expand: function (i, j) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        let value = Blockchain.transaction.value;
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        if (user.expandMap[i + ',' + j]) {
            throw new Error("Place already expanded:" + i + "," + j);
        }
        this.totalNas = this.totalNas.plus(value);
        user.rechargeOnExpand = user.rechargeOnExpand.plus(value);
        let totalRechargeOnExpand = user.rechargeOnExpand / 1e18;
        let totallyNeed = this.getExpandCost(0, user.expandCnt + 1);
        if (totalRechargeOnExpand < totallyNeed) {
            throw new Error("Expand recharge NOT ENOUGH. Totally need " + totallyNeed + ", now " + totalRechargeOnExpand);
        }
        user.expandMap[i + ',' + j] = { order: user.expandCnt };
        user.expandCnt += 1;

        this.allUsers.set(userAddress, user);
        return {
            "success": true,
            "result_data": user,
            "newExpand": [i, j]
        };
    },
    build: function (i, j, buildingId) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        if (!user.expandMap[i + ',' + j]) {
            throw new Error("Build Failed. (" + i + ',' + j + ") has not yet expanded.");
        }
        if (user.buildingMap[i + ',' + j]) {
            throw new Error("Build Failed. (" + i + ',' + j + ") has a building.");
        }
        //buildingInfo
        let info = this.allBuildingInfos[buildingId];
        //check cargo
        if (user.cargoData.iron < info.IronCost) {
            throw new Error("Build Failed. Iron NOT ENOUGH." + user.cargoData.iron + "<" + info.IronCost);
        }
        //build!
        let curTime = (new Date()).valueOf();
        user.buildingMap[i + ',' + j] = { id: buildingId, lv: 0, recoverTime: curTime + info.MaxCD / 4, justBuildOrUpgrade: true };
        user.cargoData.iron -= info.IronCost;

        this.allUsers.set(userAddress, user);
        return {
            "success": true,
            "result_data": user,
            "newBuilding": [i, j, buildingId]
        }
    },
    upgradeBuilding: function (i, j) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        if (!user.expandMap[i + ',' + j]) {
            throw new Error("Upgrade Failed. (" + i + ',' + j + ") has not yet expanded.");
        }
        if (!user.buildingMap[i + ',' + j]) {
            throw new Error("Upgrade Failed. (" + i + ',' + j + ") has no building.");
        }
        //buildingInfo
        let info = this.allBuildingInfos[buildingId];
        //cur Level
        let curLv = user.buildingMap[i + ',' + j].lv;
        if (curLv >= info.MaxLevel) {
            throw new Error("Upgrade Failed. Building level is MAX.");
        }
        //check cargo
        let ironMulti = this.allBuildingInfos['_upgradeRate'].ironCost;
        let ironCost = info.ironCost * Math.pow(ironMulti, curLv + 1);
        if (user.cargoData.iron < ironCost) {
            throw new Error("Upgrade Failed. Iron NOT ENOUGH." + user.cargoData.iron + "<" + ironCost);
        }
        //upgrade!
        user.buildingMap[i + ',' + j].lv += 1;
        user.cargoData.iron -= ironCost;

        let cdMulti = this.allBuildingInfos['_upgradeRate'].MaxCD;
        let maxCD = info.MaxCD * Math.pow(cdMulti, curLv + 1);

        user.buildingMap[i + ',' + j].recoverTime = curTime + maxCD / 4;
        user.buildingMap[i + ',' + j].justBuildOrUpgrade = true;

        this.allUsers.set(userAddress, user);
        return {
            "success": true,
            "result_data": user,
            "newBuilding": [i, j, buildingId]
        }
    },
    demolish: function (i, j) {
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        if (!user.buildingMap[i + ',' + j]) {
            throw new Error("Demolish Failed. (" + i + ',' + j + ") has no building.");
        }
        //buildingInfo
        let info = this.allBuildingInfos[buildingId];
        if (info) {
            //cur Level
            let curLv = user.buildingMap[i + ',' + j].lv;
            //retrieve iron
            let ironMulti = this.allBuildingInfos['_upgradeRate'].ironCost;
            let lastLvIronCost = info.ironCost * Math.pow(ironMulti, curLv);
            //demolish!
            user.cargoData.iron += ironCost / 2;
        }
        user.buildingMap[i + ',' + j] = null;

        this.allUsers.set(userAddress, user);
        return {
            "success": true,
            "result_data": user,
            "newBuilding": [i, j, buildingId]
        }
    },
    produce: function (i, j, amount) {
        if (amount != Math.floor(amount)) {
            throw new Error("amount must be Integer." + amount);
        }
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        this._recalcUser(user);
        let building = user.buildingMap[i + ',' + j];
        if (!building) {
            throw new Error("Building NOT FOUND." + i + ',' + j);
        }
        let curTime = (new Date()).valueOf();
        if (building.recoverTime < curTime) {
            throw new Error("Production is still in Cooldown." + i + ',' + j + " recoverTime:" + building.recoverTime);
        }

        //check input cargo!
        let info = this.getBuildingInfo(building.id);
        let out0 = info['Out0'];
        let in0 = info['In0'];
        let in0Amount = info['In0Amt'] * amount;
        let in1 = info['In1'];
        let in1Amount = info['In1Amt'] * amount;
        if (!user.cargoData[in0] || user.cargoData[in0] < in0Amount) {
            throw new Error("Input0 cargo NOT ENOUGH." + user.cargoData[in0]);
        }
        if (!user.cargoData[in1] || user.cargoData[in1] < in1Amount) {
            throw new Error("Input1 cargo NOT ENOUGH." + user.cargoData[in1]);
        }

        //produce!
        user.cargoData[in0] -= in0Amount;
        user.cargoData[in1] -= in1Amount;
        user.cargoData[out0] += amount;

        //check MaxCD
        let cdPerUnit = amount * this.getBuildingInfoItemWithLv(building.id, 'CDPerUnit', building.lv);
        let cd = amount * cdPerUnit;
        let maxCD = this.getBuildingInfoItemWithLv(building.id, 'MaxCD', building.lv);
        if (cd > maxCD) {
            throw new Error("Amout TOO MUCH." + amount + " should < " + (maxCD / cdPerUnit));
        }
        //check Warehouse
        let warehouseCap = this.getUserWarehouseCap(userAddress, out0);
        if (user.cargoData[out0] > warehouseCap) {
            throw new Error("Warehouse Capacity NOT ENOUGH." + user.cargoData[out0] + " should <= " + warehouseCap);
        }

        building.recoverTime = curTime + cd;
        building.justBuildOrUpgrade = null;

        this.allUsers.set(userAddress, user);
        return {
            "success": true,
            "result_data": user,
            "newBuilding": [i, j, buildingId]
        }
    },
    attackIsland: function (islandIndex, army) {
        let island = this.allIslands.get(islandIndex);
        let userAddress = Blockchain.transaction.from;
        let user = this.allUsers.get(userAddress);
        let curTs = (new Date()).valueOf();
        if (island === null) {
            throw new Error("Error island index." + islandIndex);
        }
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        //check distance
        let dx = locData.x - island.x;
        let dy = locData.y - island.y;
        let dist = Math.sqrt(dx * dx + dy + dy);
        if (dist > 100) {
            throw new Error("Too far from the island." + islandIndex + ", distance:" + dist);
        }

        let powerAttenuRate = new BigNumber(0.05);
        let hoursDelta = (new BigNumber(curTs - island.lastBattleTime)).div(1000 * 3600);
        let attenu = Math.exp(powerAttenuRate.times(hoursDelta).negated());
        for (let key in island.army) {
            island.army[key] = Math.round(island.army[key] * attenu);
        }
        island.lastBattleTime = curTs;
        if (island.occupant === "" || island.occupant === userAddress) { // 没有被占领或者自己占领
            if (island.occupant === "") {
                island.lastMineTime = curTs;
            }
            island.occupant = userAddress;

            for (let key in army) {
                if (user.cargoData[key] < army[key]) {
                    throw new Error("Army NOT ENOUGH." + key);
                }
                if (!island.army[key]) island.army[key] = army[key];
                else island.army[key] += army[key];
                user.cargoData[key] -= army[key];
            }

            this.allIslands.set(islandIndex, island);
            this.allUsers.set(userAddress, user);
            return {
                "success": true,
                "result_data": user,
                "island": island,
            };
        } else {
            let res = this._battle(island.army.fighter, island.army.bomber, 0,
                army.fighter, army.bomber, 0)
            if (res["win"]) { // 防守失败
                this._collect_island_money_proc(island); // 把上个玩家挖到的钱发给该玩家
                island = this.allIslands.get(islandIndex); // 这边要重新获取，因为money会改变
                island.occupant = userAddress;
                island.lastMineTime = curTs;
            }
            island.army.fighter = res['left'][0];
            island.army.bomber = res['left'][1];
            island.army.laser = res['left'][2];

            for (let key in army) {
                if (user.cargoData[key] < army[key]) {
                    throw new Error("Army NOT ENOUGH." + key);
                }
                user.cargoData[key] -= army[key];
            }

            this.allUsers.set(userAddress, user);

            this.allIslands.set(islandIndex, island);
            return {
                "success": res["win"],
                "result_data": island
            };
        }
    },
    getSailEnergyCost: function (user) {
        let locData = user.locationData;
        if (locData.destinationX === null || locData.destinationY === null) return 0;
        let dX = locData.destinationX - locData.lastLocationX;
        let dY = locData.destinationY - locData.lastLocationY;
        let dist = Math.sqrt(dX * dX + dY * dY);
        return dist * (user.expandCnt + 5) * this.energyCostPerLyExpand;
    },
    _lerpVec2: function (a, b, t, clamp) {
        if (clamp) t = Math.max(0, Math.min(1, t));
        let res = {};
        res.x = a.x * (1 - t) + b.x * t;
        res.y = a.y * (1 - t) + b.y * t;
        return res;
    },
    _recalcUser: function (user) {
        let curTime = (new Date()).valueOf();
        //location
        let locData = user.locationData;
        if (locData.destinationX === null || locData.destinationY === null) return 0;
        let dX = locData.destinationX - locData.lastLocationX;
        let dY = locData.destinationY - locData.lastLocationY;
        let dist = Math.sqrt(dX * dX + dY * dY);
        let needTime = dist / user.locationData.speed;
        let t = (curTime - user.locationData.lastLocationTime) / needTime;
        if (t < 1) {
            let curLoc = this._lerpVec2({ x: locData.lastLocationX, y: locData.lastLocationY }, { x: locData.destinationX, y: locData.destinationY }, t, false);
            locData.lastLocationX = curLoc.x;
            locData.lastLocationY = curLoc.y;
        } else {
            locData.lastLocationX = locData.destinationX;
            locData.lastLocationY = locData.destinationY;
            locData.destinationX = null;
            locData.destinationY = null;
        }
        locData.lastLocationTime = curTime;
        user.locationData = locData;

        if (user.state == 0) {

        } else if (user.state == 1) {
            //collecting
            if (user.collectingStarIndex) {
                let star = this.getStarInfo(user.collectingStarIndex);
                let collectingHours = (curTime - user.lastCalcTime) / 3600000;
                let collectedIron = star.ironAbundance * this.getUserCollectorRate(user.address, 'ironcoll') * collectingHours;
                let collectedEnergy = star.energyAbundance * this.getUserCollectorRate(user.address, 'energycoll') * collectingHours;
                user.cargoData.iron += collectedIron;
                user.cargoData.energy += collectedEnergy;
            }
        }
        user.lastCalcTime = curTime;

        this.allUsers.set(user.address, user);
    },
    _battle: function (bb1, cc1, dd1, bb2, cc2, dd2) { /*策划设定*/
        let c1 = 20; /*攻击方坦克攻击*/
        let d1 = 100; /*攻击方坦克HP*/
        let e1 = 50; /*攻击方直升机攻击*/
        let f1 = 40; /*攻击方直升机HP*/
        let g1 = 100; /*攻击方炮舰攻击*/
        let h1 = 20; /*攻击方炮舰HP*/

        let c2 = 20; /*防守方坦克攻击*/
        let d2 = 100; /*防守方坦克HP*/
        let e2 = 50; /*防守方直升机攻击*/
        let f2 = 40; /*防守方直升机HP*/
        let g2 = 100; /*防守方炮舰攻击*/
        let h2 = 20; /*防守方炮舰HP*/

        let k3 = 1; /*防守方属性加成*/
        let k1 = 0; /*防守方属性加成*/
        let k2; /*打肉系数-随机*/

        /*计算变量*/
        let y; /*战力差/剩余*/
        let a; /*剩余比例*/

        let z1; /*攻击方总战力*/
        let z2; /*防守方总战力*/

        /*输出变量*/
        let x; /*胜负，0为攻击方胜，1为防守方胜*/
        let bb; /*获胜方坦克数量*/
        let cc; /*获胜方直升机数量*/
        let dd; /*获胜方炮舰数量*/

        /*胜负判断*/
        z1 = (c1 * bb1 ** (k3) + e1 * cc1 ** (k3) + g1 * dd1 ** (k3)) *
            (d1 * bb1 + f1 * cc1 + h1 * dd1);

        z2 = (c2 * bb2 + e2 * cc2 ** (k3) + g2 * dd2 ** (k3)) * (1 + k1) *
            (d2 * bb2 + f2 * cc2 + h2 * dd2);

        y = z1 - z2;

        if (y >= 0) {
            x = false
        } else {
            x = true
        }

        /*获胜方剩余兵力*/
        if (x == 0) {
            a = y / z1;
            k2 = 1 - Math.random() * 0.3;
            bb = Math.floor(bb1 * a * k2);
            cc = Math.min(cc1, Math.floor(cc1 * a + bb1 * a * (1 - k2) * d1 / 2 / f1));
            dd = Math.min(dd1, Math.floor(dd1 * a + bb1 * a * (1 - k2) * d1 / 2 / h1));
        } else {
            a = -y / z2;
            k2 = 1 - Math.random() * 0.3;
            bb = Math.floor(bb2 * a * k2);
            cc = Math.min(cc2, Math.floor(cc2 * a + bb2 * a * (1 - k2) * d2 / 2 / f2));
            dd = Math.min(dd2, Math.floor(dd2 * a + bb2 * a * (1 - k2) * d2 / 2 / h2));

        }

        console.log(bb1, cc1, dd1, '|', bb2, cc2, dd2, '获胜方', x, '剩余', bb, cc, dd);
        return {
            "win": x,
            "left": [bb, cc, dd]
        }
    },
    collectIslandMoney: function (islandId) {
        let isLand = this.allIslands.get(islandId);
        let userAddress = Blockchain.transaction.from;
        if (isLand === null || isLand.occupant !== userAddress) {
            throw new Error("Error island id.")
        }
        let mineMoney = this._collect_island_money_proc(isLand);

        return {
            "success": true,
            "result_data": mineMoney
        };
    },
    _collect_island_money_proc: function (island) {
        let curTs = (new Date()).valueOf();
        let hoursDelta = (new BigNumber(curTs - island.lastMineTime)).div(1000 * 3600);
        let collectedMoney = BigNumber.min(island.money, new BigNumber(1e18 * island.miningSpeed * hoursDelta));
        island.money = island.money.minus(collectedMoney);
        this.totalNas = this.totalNas.minus(collectedMoney);
        island.lastMineTime = curTs;
        this.allIslands.set(island.id, island);
        this._transaction(island.occupant, collectedMoney);

        return collectedMoney;
    },
    _transaction: function (targetAddress, value) {
        var result = Blockchain.transfer(targetAddress, value);
        console.log("transfer result:", result);
        Event.Trigger("transfer", {
            Transfer: {
                from: Blockchain.transaction.to,
                to: targetAddress,
                value: value
            }
        });
    },
    sponsor: function (islandId, sponsorName, link, miningSpeed) {
        let island = this.allIslands.get(islandId);
        let value = Blockchain.transaction.value;
        let userAddress = Blockchain.transaction.from;
        let res;
        if (island === null) {
            throw new Error("Error island id.");
        }
        if (miningSpeed < 0.001) {
            throw new Error("miningSpeed must >= 0.001NAS/h." + miningSpeed);
        }
        this._collect_island_money_proc(islandId);
        if (island.sponsor !== userAddress && value < island.money.times(1.2)) {
            throw new Error("value must > current money * 1.2. value:" + value + ", island.money:" + island.money);
        }
        if (island.sponsor !== userAddress) {
            //return money back
            this._transaction(island.sponsor, island.money);
            this.totalNas = this.totalNas.minus(island.money);
            island.sponsor = userAddress;
            island.money = value;
        } else {
            island.money = value.plus(island.money);
        }
        this.totalNas = value.plus(this.totalNas);
        island.sponsorName = sponsorName;
        island.sponsorLink = link;
        island.mineSpeed = miningSpeed;

        this.allIslands.set(islandId, island);

        return {
            "success": true,
            "island": island
        };;
    },
    takeRedundantNas: function (targetAddress, value) {
        if (Blockchain.transaction.from != this.adminAddress) {
            throw new Error("Permission denied.");
        }
        if (Blockchain.verifyAddress(targetAddress) == 0) {
            throw new Error("Illegal Address.");
        }

        this.totalNas = value.minus(value);
        this._transaction(targetAddress, new BigNumber(value))
    },
    getStarInfo: function (index) {
        let a = (this.APHash1(index.toFixed() + 'startheta'));
        let b = (this.APHash1(index.toFixed() + 'rhostar'));
        let c = (this.APHash1(index.toFixed() + 'ironAbund'));
        let d = (this.APHash1(index.toFixed() + 'energyAbund'));
        let theta = a * Math.PI * 2;
        let l = b * 5000;
        let x = Math.cos(theta) * l;
        let y = Math.sin(theta) * l;
        let starInfo = {};
        starInfo.x = x;
        starInfo.y = y;
        starInfo.ironAbundance = (1 - b) * c;
        starInfo.energyAbundance = (1 - b) * d;
        return starInfo;
    },
    APHash1: function (str) {
        let hash = 0xAAAAAAAA;
        for (let i = 0; i < str.length; i++) {
            if ((i & 1) == 0) {
                hash ^= ((hash << 7) ^ str.charCodeAt(i) * (hash >> 3));
            }
            else {
                hash ^= (~((hash << 11) + str.charCodeAt(i) ^ (hash >> 5)));
            }
        }
        return hash / 0xAAAAAAAA / 1.5 + 0.5;
    },
    getExpandCost: function (curExpandCnt, addExpandCnt) {
        let cost = 0;
        for (let i = curExpandCnt; i < curExpandCnt + addExpandCnt; i++) {
            cost += 0.0001 * Math.exp(0.15 * i);
        }
        return cost;
    },
    getExpandCostNas: function (curExpandCnt, addExpandCnt) {
        let cost = new BigNumber(0);
        let a = new BigNumber(0.0001 * 1e18);
        for (let i = curExpandCnt; i < curExpandCnt + addExpandCnt; i++) {
            cost = cost.add(a.times(Math.exp(new BigNumber(0.15).times(new BigNumber(i))).toString()).trunc());
        }
        return cost;
    },
    getBuildingInfoItemWithLv: function (buildingId, itemName, lv) {
        let value = this.allBuildingInfos.get(id)[itemName];
        let multi = this.allBuildingInfos.get('_UpgradeRate')[itemName];
        if (!isNaN(multi)) {
            value = value * Math.pow(multi, lv);
        }
        return value;
    },
    getUserCollectorRate: function (userAddress, buildingId) {
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        let info = this.allBuildingInfos.get(buildingId);
        let rate = 0;
        for (let key in user.buildingMap) {
            let bdg = user.buildingMap[key];
            if (bdg && bdg.id === buildingId) {
                rate += this.getBuildingInfoItemWithLv(buildingId, 'Out0Rate', bdg.lv);
            }
        }
        return rate;
    },
    getUserWarehouseCap: function (userAddress, cargoName) {
        let user = this.allUsers.get(userAddress);
        if (user === null) {
            throw new Error("User NOT FOUND.");
        }
        let houseName = cargoName + 'house';
        let info = this.allBuildingInfos.get(houseName);
        let cap = 0;
        for (let key in user.buildingMap) {
            let bdg = user.buildingMap[key];
            if (bdg && bdg.id === houseName) {
                cap += this.getBuildingInfoItemWithLv(houseName, 'Capacity', bdg.lv);
            }
        }
        return cap;
    },
    //Admin
    changeConst: function (constName, value) {
        if (Blockchain.transaction.from !== this.adminAddress) {
            throw new Error("Permission denied.");
        }
        this[constName] = value;
    },
    setBuildingInfo: function (infoArray) {
        if (Blockchain.transaction.from != this.adminAddress) {
            throw new Error("Permission denied.");
        }
        for (let key in this.allBuildingInfos) {
            this.allBuildingInfos.del(key);
        }
        for (let i = 0; i < infoArray.length; i++) {
            let info = infoArray[i];
            this.allBuildingInfos.set(info.id, info);
        }
        return {
            "success": true,
            "length": infoArray.length
        }
    },
    getBuildingInfo: function (id) {
        return this.allBuildingInfos.get(id);
    },
    setIslandInfo: function (infoArray) {
        if (Blockchain.transaction.from != this.adminAddress) {
            throw new Error("Permission denied.");
        }
        if (infoArray.length < this.allIslands.length) {
            throw new Error("You can only set longer infoArray. >=" + this.allIslands.length);
        }
        let allIslands = this.allIslands;
        for (let i = 0; i < infoArray.length; i++) {
            let info = infoArray[i];
            if (i < allIslands.length) {
                allIslands[i].x = info.x;
                allIslands[i].y = info.y;
            } else {
                let newIsland = {};
                newIsland.x = info.x;
                newIsland.y = info.y;
                allIslands.push(newIsland);
            }
        }
        this.allIslands = allIslands;
        return {
            "success": true,
            "length": infoArray.length
        }
    },
    getIslandInfo: function (index) {
        return this.allIslands[index];
    }
}


module.exports = GameContract;