db.getSiblingDB('facebookmark').vehicles.find({}, {
    vin: 1,
    year: 1,
    make: 1,
    model: 1,
    'images': 1,
    'features': 1,
    exteriorColor: 1,
    interiorColor: 1
}).limit(20).pretty()
