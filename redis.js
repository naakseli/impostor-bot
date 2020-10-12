const redis = require("redis");

const redisClient = redis.createClient({
	url: process.env.REDISTOGO_URL,
});

redisClient.on("ready", function(error) {
	console.log("Redis connected succesfully!")
});

const addToArray = (key, object) => {
    return new Promise((resolve, reject) => {
        
        redisClient.get(key, async(err, reply) => {
            if (err) return reject(err)

            if (!reply) {
                redisClient.set(key, JSON.stringify([object]), () => {
                    resolve([object])
                })
                
            } 
            else {
                let tempArr = JSON.parse(reply)
                tempArr = [...tempArr, object]
                await redisClient.set(key, JSON.stringify(tempArr), () => {
                    resolve(tempArr)
                })
            }
            
        })
    })
}

const setArray = (key, array) => {
    return new Promise((resolve, reject) => {
        redisClient.set(key, JSON.stringify(array))
        resolve()
    })
}

const getArray = key => {
    return new Promise((resolve, reject) => {
        redisClient.get(key, (err, reply) => {
            if(err) reject(err)
            else if (!reply) resolve( [] )
            else resolve(JSON.parse(reply))
        })
    })
}

const removeFromArray = (key, object) => {
    return new Promise((resolve, reject) => {
        
        redisClient.get(key, (err, reply) => {
            if (err) return reject(err)
            if (!reply) return resolve()

            
            let tempArr = JSON.parse(reply)
            if(!tempArr) return
            tempArr = tempArr.filter(arrayMember => arrayMember.username !== object.username)
            
            redisClient.set(key, JSON.stringify(tempArr))
            resolve(tempArr)
        })
    })
}

const clearAll = () => {
    redisClient.set('invitedUsers', JSON.stringify([]))
    redisClient.set('registeredUsers', JSON.stringify([]))
    redisClient.set('unableUsers', JSON.stringify([]))
    redisClient.set('pendingUsers', JSON.stringify([]))
    redisClient.set('gameMessages', JSON.stringify([]))
}


module.exports = { getArray, setArray, addToArray, removeFromArray, clearAll }