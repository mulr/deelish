const mongoose = require('mongoose');
const Store = mongoose.model('Store'); 
const User = mongoose.model('User'); 
const multer = require('multer');
const jimp = require('jimp'); //resize photos--multer
const uuid = require('uuid'); //file names photo unique--




const multerOptions = {
  storage: multer.memoryStorage(),
  fileFilter(req, file, next) {
    const isPhoto = file.mimetype.startsWith('image/jpeg');
    if(isPhoto) {
      next(null, true);
    } else {
      next({ message: 'That filetype isn\'t allowed!' }, false);
    }
  }
};


exports.homePage = (req, res) => {
  res.render('index');
};

exports.addStore = (req, res) => {
  res.render('editStore', { title: 'Add Store'});
};

exports.upload = multer(multerOptions).single('photo');
 
exports.resize = async (req, res, next) => {
  //check whether file to resize
  if(!req.file) {
    next(); //skip to next 
    return; //stop this function
  }
  const extension = req.file.mimetype.split('/')[1];
  req.body.photo = `${uuid.v4()}.${extension}`;
  //now to resize it
  const photo = await jimp.read(req.file.buffer);
  await photo.resize(800, jimp.AUTO);
  await photo.write(`./public/uploads/${req.body.photo}`);
  //once written to filesystem, keep going
  next();
};

exports.createStore = async (req, res) => {
  req.body.author = req.user._id;
  const store = await (new Store(req.body)).save();
  req.flash('success', `Successfully created ${store.name}. Care to leave a review?`);
  res.redirect(`/store/${store.slug}`);
}; 

exports.getStores = async (req, res) => {
  //need query DB for stores
  const stores = await Store.find();
  res.render('stores', {title: 'Stores', stores});
}

const confirmOwner = (store, user) => {
  if (!store.author.equals(user._id)) {
    throw Error('You must own the store inorder to edit it!');
  }
};

exports.editStore = async (req, res) => {
  //find store id
  // res.json(req.params); to test
  const store = await Store.findOne({ _id: req.params.id });
  // res.json(store); to test

  //confirm owner 
  confirmOwner(store, req.user);
  //render edit form to update
  res.render('editStore', { title: `Edit ${store.name}`, store});
}

exports.updateStore = async (req, res) => {
  //On update, not "Point", fixing that here:
  req.body.location.type = 'Point';

  //find and update store
  const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, 
    { new: true,
      runValidators: true
    }).exec();
    //redirect them the store and tell them worked
    req.flash('success', `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store -></a>`);
    res.redirect(`/stores/${store._id}/edit`);
};

exports.getStoreBySlug = async (req, res, next) => {
  const store = await Store.findOne({ slug: req.params.slug }).populate('author reviews');
  if (!store) return next();
  res.render('store', { store, title: store.name });
};

exports.getStoresByTag = async (req, res) => {
  //get list of all stores
  const tag = req.params.tag;
  //if no specified tag, show all that have a tag
  const tagQuery = tag || { $exists: true };
  const tagsPromise = Store.getTagsList();
  const storesPromise = Store.find({ tags: tagQuery });
  const [ tags, stores ] = await Promise.all([ tagsPromise, storesPromise ]);
 
  res.render('tag', { tags, title: 'Tags', tag, stores });
};

//API
exports.searchStores = async (req, res) => {
  const stores = await Store.find({
    $text: {
      $search: req.query.q
    }
  }, {
    score: { $meta: 'textScore' }
  }).sort({
    score: { $meta: 'textScore' }
  })
  .limit(5);
  res.json(stores);
};

exports.mapStores = async (req, res) => {
  const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
  const q = {
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates
        },
        $maxDistance: 20000 //10km
      }
    }
  }

  const stores = await Store.find(q).select('slug name description location photo').limit(10);
  res.json(stores);
};

exports.mapPage = (req, res) => {
  res.render('map', { title: 'Map' });
};

exports.heartStore = async (req, res) => {
  const hearts = req.user.hearts.map(obj => obj.toString());
  const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
  const user = await User.findByIdAndUpdate(req.user._id,
    { [operator]: { hearts: req.params.id}},
    { new: true }
  );

  res.json(user);
};

exports.getHearts = async(req, res) => {
  const stores = await Store.find({
    //finding where id prop of store is in req.user.hearts (in an array)
    _id: { $in: req.user.hearts }
  })
  res.render('stores', { title: 'Hearted Stores', stores })
};

exports.getTopStores = async (req, res) => {
  const stores = await Store.getTopStores();
  res.render( 'topStores', { stores, title: '⭐️ Top Stores'}  )
};