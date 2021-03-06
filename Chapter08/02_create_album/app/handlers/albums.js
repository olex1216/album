/*服务器端--处理程序*/
var helpers = require('./helpers.js');
var album_data = require("../data/album.js");
var async = require('async');
var fs = require('fs');

exports.version = "0.1.0";

/*Photo class*/
function Photo(photo_data) {
    this.filename =photo_data.filename;
    this.date = photo_data.date;
    this.albumid = photo_data.albumid;
    this.description = photo_data.description;
    this._id = photo_data._id;
}
Photo.prototype._id = null;
Photo.prototype.filename = null;
Photo.prototype.date = null;
Photo.prototype.albumid = null;
Photo.prototype.description = null;
Photo.prototype.response_obj = function() {
    return {
        filename: this.filename,
        date: this.date,
        albumid: this.albumid,
        description: this.description
    };
};

/*Album class*/
function Album (album_data) {
    this.name = album_data.name;
    this.date = album_data.date;
    this.title = album_data.title;
    this.description = album_data.description;
    this._id = album_data._id;
}

Album.prototype.name = null;
Album.prototype.date = null;
Album.prototype.title = null;
Album.prototype.description = null;
Album.prototype.response_obj = function () {
    return { name: this.name,
             date: this.date,
             title: this.title,
             description: this.description };
};
Album.prototype.photos = function (pn, ps, callback) {
    if (this.album_photos !== undefined) {
        callback(null, this.album_photos);
        return;
    }


    album_data.photos_for_album(
        this.name,
        pn, ps,
        function (err, results) {
            if (err) {
                callback(err);
                return;
            }


            var out = [];
            for (var i = 0; i < results.length; i++) {
                out.push(new Photo(results[i]));
            }

            this.album_photos = out;
            callback(null, this.album_photos);
        }
    );
};

Album.prototype.add_photo = function (data, path, callback) {
    album_data.add_photo(data, path, function (err, photo_data) {
        if (err) {
            callback(err);
        }
        else {
            var p = new Photo(photo_data);
            if (this.all_photos) {
                this.all_photos.push(p);
            }
            else {
                this.all_photos = [ p ];
            }

            callback(null, p);
        }
    });
};


/*创建新相册*/
exports.create_album = function(req,res) {
    async.waterfall([

        //1. make sure the albumid is valid
        function(cb) {
            if (!req.body || !req.body.name || !helpers.valid_filename(req.body.name)) {
                cb(helpers.no_such_album());
                return;
            }
            //UNDONE: we should add some code to make sure the album
            // doesn't already exist!
            cb(null);
        },

        /*2.创建新相册*/
        function (cb) {
            album_data.create_album(req.body, cb);//调用数据库的创建相册功能
        }
    ],
    function(err,results) {
        if (err) {
            helpers.send_failure(res, helpers.http_code_for_error(err), err);
        } else {
            var a = new Album(results);
            helpers.send_success(res, {album: a.response_obj() });
        }
    });
};

/*查询相册*/
exports.album_by_name = function (req, res) {
    async.waterfall([
        //1.get the album
        function(cb) {
            if (!req.params || !req.params.album_name) {
                cb(helpers.no_such_album());
            } else {
                album_data.album_by_name(req.params.album_name, cb);
            }
        }
    ],
    function(err,results) {
        if (err) {
            helpers.send_failure(res, helpers.http_code_for_error(err), err);
        } else if (!results) {
            err = helpers.no_such_album();
            helpers.send_failure(res, helpers.http_code_for_error(err), err);
        } else {
            var a = new Album(album_data);
            helpers.send_success(res, { album: a.response_obj() });
        }
    });

};

/*相册列表*/
exports.list_all = function(req,res) {
    album_data.all_albums("date",true,0,25,function(err,results) {
        if (err) {

            helpers.send_failure(res,helpers.http_code_for_error(err), err);
        } else {
            var out = [];
            if (results) {
                for (var i = 0; i < results.length; i++) {
                    out.push(new Album(results[i]).response_obj());
                }
            }
            helpers.send_success(res,{ albums: out});
        }
    });
};

/*获取相册中的照片*/
exports.photos_for_album = function(req,res) {
    var page_num = req.query.page ? req.query.page : 0;
    var page_size = req.query.page_size ? req.query.page_size : 1000;
    page_num = parseInt(page_num);
    page_size = parseInt(page_size);
    if (isNaN(page_num)) page_num = 0;
    if (isNaN(page_size)) page_size = 1000;



    var album;
    async.waterfall([
        //1.get the album.
        function(cb) {
            if (!req.params || !req.params.album_name) {
                cb(helpers.no_such_album());
            } else {

                album_data.album_by_name(req.params.album_name, cb);
            }
        },
        //2.get the photos of the album
        function(album_data,cb) {
            if (!album_data) {

                cb(helpers.no_such_album());
                return;
            }
            album = new Album(album_data);
            album.photos(page_num, page_size, cb);
        },
        //3.截取照片
        function(photos,cb) {
            var out = [];

            for (var i = 0; i < photos.length; i++) {
                out.push(photos[i].response_obj());
            }

            cb(null, out);
        }
    ],
    function(err,results) {
        if (err) {
            helpers.send_failure(res, helpers.http_code_for_error(err), err);
            return;
        }
        if (!results) {
            results = [];
        }
        var out = { photos: results,
                    album_data: album.response_obj() };

        helpers.send_success(res,out);

    });

};

/*添加新照片*/
exports.add_photo_to_album = function(req,res) {
    var album;
    async.waterfall([

        function(cb) {
            if(!req.body){
                cb(helpers.missing_data("POST data"));
            } else if (!req.files || !req.files.photo_file) {
                cb(helpers.missing_data("a file"));
            } else if (!helpers.is_image(req.files.photo_file.name)){
                cb(helpers.not_image());/*非照片*/
            } else {
                // get the album
                album_data.album_by_name(req.params.album_name, cb);
            }
        },
        function(album_data,cb) {
            if (!album_data) {
                cb(helpers.no_such_album());
                return;
            }

            album = new Album(album_data);
            req.body.filename = req.files.photo_file.name;
            album.add_photo(req.body, req.files.photo_file.path, cb);
        }
    ],
    function(err,p) {
        if (err) {
            helpers.send_failure(res, helpers.http_code_for_error(err), err);
            return;
        }
        var out = { photo: p.response_obj(),
                    album_data: album.response_obj() };
        helpers.send_success(res, out);
    });

};




