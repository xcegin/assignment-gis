var express = require('express');
var router = express.Router();
var pg = require('pg');
var conString = "postgres://postgres:Chidori3@localhost/pdt";

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Slovak castles' });
});

/*vsetky hrady*/
router.get('/castles', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*vsetky hrady ako body*/
    client.query(`with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point 
      WHERE historic in ('castle') and name is not null 
      UNION 
      SELECT osm_id,historic,name,ST_Centroid(way) AS geometry FROM planet_osm_polygon 
      WHERE historic in ('castle') and name is not null), multipoints as(
      Select name, ST_Collect(points.geometry) as geometry FROM castle_points as points GROUP BY name)
      select DISTINCT ON (gp.name) gp.name, gp.osm_id, gp.historic, ST_AsGeoJSON(ST_Transform(ST_Centroid(points.geometry),4326)) AS geometry from castle_points as gp JOIN multipoints points ON gp.name = points.name`, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";
        if(row.historic == "castle"){
            row.properties = {"title": row.name, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#9ACD32", "stroke": "#9ACD32", "fill": "#9ACD32"}
        } 
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*vsetky hrady ak su aj polygony*/
router.get('/castles-poly', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*vsetky hrady ako polygony a body - sfarbene podla area size*/
    client.query(`with castle_areas as( SELECT osm_id,historic,name,way AS geometry, ST_Area(way)*POWER(0.3048,2) as area  FROM planet_osm_polygon 
    WHERE historic in ('castle') and name is not null),
    total_areas as(select name,  SUM(area) AS totalarea from castle_areas GROUP BY name),
    grouped_areas as(
    select distinct on (cas.name) cas.name, cas.geometry, areas.historic, areas.osm_id, cas.area as totalarea FROM
    (select name, (ST_Union(f.geometry)) as geometry, SUM(area) as area FROM castle_areas As f GROUP BY f.name) cas JOIN castle_areas areas ON areas.name = cas.name)
    Select * from (select osm_id, name, ST_AsGeoJSON(ST_Transform(geometry,4326)) as geometry, round(totalarea::numeric, 2) as totalarea  from grouped_areas
    UNION
    select osm_id, name, ST_AsGeoJSON(ST_Transform(ST_Centroid(geometry),4326)) as geometry, round(totalarea::numeric, 2) as totalarea from grouped_areas) as final_result ORDER BY final_result.totalarea DESC`, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";
        if (row.totalarea > 2000) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#663300", "stroke": "#663300", "fill": "#663300"}
        } else if (row.totalarea > 1500) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#996633", "stroke": "#996633", "fill": "#996633"}
        } else if (row.totalarea > 1000) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#cc9900", "stroke": "#cc9900", "fill": "#cc9900"}
        } else if (row.totalarea > 500) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#cccc00", "stroke": "#cccc00", "fill": "#cccc00"}
        } else if (row.totalarea > 300) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#ffff00", "stroke": "#ffff00", "fill": "#ffff00"}
        } else if (row.totalarea > 150) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#ccff33", "stroke": "#ccff33", "fill": "#ccff33"}
        } else if (row.totalarea > 100) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#ccff66", "stroke": "#ccff66", "fill": "#ccff66"}
        } else if (row.totalarea > 50) {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#66ff33", "stroke": "#66ff33", "fill": "#66ff33"}
        } else {
          row.properties = {"title": row.name, "description": "Area: " + row.totalarea, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#009900", "stroke": "#009900", "fill": "#009900"}
        }
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*hrad s parkoviskami do metrov nejakych*/
router.get('/closeParking', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }
    /*hrady a parkoviska do danych metrov*/
    client.query({text:`with park_poi as (
      SELECT  pol.osm_id as pol_osm_id, pol.name as pol_name, ST_AsGeoJSON(ST_Transform(pol.way,4326)) AS geometry_pol, pol.type as pol_type,
      poi.osm_id as poi_osm_id, poi.name as poi_name, ST_AsGeoJSON(ST_Transform(poi.way,4326)) AS geometry_poi, poi.type as poi_type
        FROM (SELECT osm_id,amenity as name,way, amenity as type
        FROM planet_osm_polygon WHERE amenity in ('parking')) as pol 
      CROSS JOIN (SELECT osm_id,name,way, historic as type
        FROM planet_osm_point WHERE historic in ('castle') and name is not null 
        UNION SELECT osm_id,name,ST_Centroid(way) AS way, historic as type 
        FROM planet_osm_polygon WHERE historic in ('castle') and name is not null) as poi WHERE ST_DWithin(poi.way, pol.way, $1)
    )
    SELECT DISTINCT ON (osm_id) * FROM (SELECT pol_osm_id as osm_id, pol_name as name, geometry_pol AS geometry, pol_type as type
        FROM park_poi
        UNION  
        SELECT  poi_osm_id as osm_id, poi_name as name, geometry_poi AS geometry, poi_type as type
        FROM park_poi) as park_poi;`, values:[req.query.num]}, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();
    console.dir(req.query);

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";
        if(row.name == "parking"){
            row.properties = {"title": row.name, "marker-symbol": "parking", "marker-size": "large", "marker-color": "#006400", "stroke": "#006400", "fill": "#006400"};
        }   else {
            row.properties = {"title": row.name, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#9ACD32", "stroke": "#9ACD32", "fill": "#9ACD32"};
        }
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*hrad vo vzdialenosti do x km od daneho krajskeho mesta*/
router.get('/closeTowns', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*hrad vo vzdialenosti do x km od daneho krajskeho mesta*/
    client.query({text:`Select osm_id, name, ST_AsGeoJSON(ST_Transform(way,4326)) AS geometry, historic 
      from (SELECT osm_id,name,way, historic
      FROM planet_osm_point WHERE historic in ('castle') and name is not null 
      UNION SELECT osm_id,name,ST_Centroid(way) AS way, historic
      FROM planet_osm_polygon WHERE historic in ('castle') and name is not null) as data
      where ST_Distance(data.way, (Select way from planet_osm_point points where osm_id=$1)) < $2`, values:[req.query.id, req.query.num*1000]}, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();
    console.dir(req.query);

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";
        row.properties = {"title": row.name, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#9ACD32", "stroke": "#9ACD32", "fill": "#9ACD32"};
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*on click hradu zobrazenie vsetkych hovadin v jeho blizkosti ako polygonov*/
router.get('/closeInterests', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*on click hradu zobrazenie vsetkych hovadin v jeho blizkosti ako polygonov*/
    client.query({text:`with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point 
      WHERE historic in ('castle') and name is not null 
      UNION 
      SELECT osm_id,historic,name,ST_Centroid(way) AS geometry FROM planet_osm_polygon 
      WHERE historic in ('castle') and name is not null), multipoints as(
      Select name, ST_Collect(points.geometry) as geometry FROM castle_points as points GROUP BY name), finalpoints as (
      select DISTINCT ON (gp.name) gp.name, gp.osm_id, gp.historic, ST_Centroid(points.geometry) AS geometry from castle_points as gp JOIN multipoints points ON gp.name = points.name)  
      select osm_id, name, ST_AsGeoJSON(ST_Transform(way,4326)) AS geometry, historic, amenity, tourism, man_made, leisure, shop from planet_osm_polygon as pol where name is not null and building in ('yes') and ST_DWithin(pol.way, (select geometry from finalpoints where osm_id=$1), $2)`, values:[req.query.id, req.query.num]}, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();
    console.dir(req.query);

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";

        if(row.tourism == "museum" || row.tourism == "gallery"){
          row.properties = {"title": row.name, "marker-symbol": "museum", "marker-size": "small", "marker-color": "#00FF7F", "stroke": "#00FF7F", "fill": "#00FF7F"}
        } else if(row.man_made == "tower"){
          row.properties = {"title": row.name, "marker-symbol": "place-of-worship", "marker-size": "small", "marker-color": "#005129", "stroke": "#005129", "fill": "#005129"};
        } else if(row.leisure == "sports_centre"){
          row.properties = {"title": row.name, "marker-symbol": "basketball", "marker-size": "small", "marker-color": "#e3ff01", "stroke": "#e3ff01", "fill": "#e3ff01"};
        } else if(row.historic == "castle"){
          row.properties = {"title": row.name, "marker-symbol": "monument", "marker-size": "large", "marker-color": "#9ACD32", "stroke": "#9ACD32", "fill": "#9ACD32"};
        } else if(row.amenity == "restaurant"){
          row.properties = {"title": row.name, "marker-symbol": "restaurant", "marker-size": "small", "marker-color": "#156bcc", "stroke": "#156bcc", "fill": "#156bcc"};
        } else if(row.amenity == "embassy"){
          row.properties = {"title": row.name, "marker-symbol": "embassy", "marker-size": "small", "marker-color": "#9010ff", "stroke": "#9010ff", "fill": "#9010ff"};
        } else if(row.amenity == "bank"){
          row.properties = {"title": row.name, "marker-symbol": "bank", "marker-size": "small", "marker-color": "#ff9410", "stroke": "#ff9410", "fill": "#ff9410"};
        } else if(row.tourism == "hotel" || row.tourism == "guest_house"){
          row.properties = {"title": row.name, "marker-symbol": "hotel", "marker-size": "small", "marker-color": "#ff1010", "stroke": "#ff1010", "fill": "#ff1010"};
        } else if(row.shop){
          row.properties = {"title": row.name, "marker-symbol": "commercial", "marker-size": "small", "marker-color": "#3e2d31", "stroke": "#3e2d31", "fill": "#3e2d31"};
        } else if(row.amenity == "place_of_worship"){
          row.properties = {"title": row.name, "marker-symbol": "place-of-worship", "marker-size": "small", "marker-color": "#635400", "stroke": "#635400", "fill": "#635400"};
        } else {
          row.properties = {"title": row.name, "marker-symbol": "building", "marker-size": "small", "marker-color": "#6d6d66", "stroke": "#6d6d66", "fill": "#6d6d66"};
        }
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*zobrazenie cestnej siete pre pesich v okruhu od hradu*/
router.get('/roads', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*zobrazenie cestnej siete pre pesich v okruhu od hradu*/
    client.query({text:`with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point  
      WHERE historic in ('castle') and name is not null 
      UNION 
      SELECT osm_id,historic,name,ST_Centroid(way) AS geometry FROM planet_osm_polygon 
      WHERE historic in ('castle') and name is not null), multipoints as(
      Select name, ST_Collect(points.geometry) as geometry FROM castle_points as points GROUP BY name), finalpoints as (
      select DISTINCT ON (gp.name) gp.name, gp.osm_id, gp.historic, ST_Centroid(points.geometry) AS geometry from castle_points as gp JOIN multipoints points ON gp.name = points.name),
      buffer as (SELECT ST_Buffer((Select geometry as way from finalpoints points where osm_id=$1),500)),
      ways as (
      SELECT * from planet_osm_line where highway in ('footway', 'steps', 'pedestrian', 'footpath')),
      highways as (
      select highway, ST_Intersection(way, (select * from buffer)) as way from ways where ST_Intersects(way, (select * from buffer)))
      select highway, ST_AsGeoJSON(ST_Transform(way,4326)) as geometry, round(ST_Length(way)::numeric, 2) as len from highways`, values:[req.query.id]}, function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();
    console.dir(req.query);

    result.rows.map(function(row){
      try {
        row.geometry = JSON.parse(row.geometry);
        row.type = "Feature";
        if(row.highway == "footway" || row.tourism == "footpath"){
          row.properties = {"title": row.highway, "description": "Length: " + row.len, "stroke": "#c97b1c", "fill": "#c97b1c"}
        } else if(row.highway == "steps"){
          row.properties = {"title": row.highway, "description": "Length: " + row.len, "stroke": "#707070", "fill": "#707070"};
        } else if(row.highway == "pedestrian"){
          row.properties = {"title": row.highway, "description": "Length: " + row.len, "stroke": "#7a6258", "fill": "#7a6258"};
        }
      } catch (e) {
        row.geometry = null;
      }
      return row;
     });
    res.end(JSON.stringify(result.rows));
    });
  });
});

/*naplnenie selectu v html*/
router.get('/selectBigCities', function(req, res, next) {
  res.writeHead(200, {"Content-Type": "application/json"});
  
  var client = new pg.Client(conString);
  client.connect(function(err) {
    if(err) {
      return console.error('could not connect to postgres', err);
    }

    /*naplnenie selectu v html*/
    client.query("select * from planet_osm_point points where place in ('city') and population::integer > 54931 ORDER BY population::integer DESC", function(err, result) {

    if(err) {
      return console.error('error running query', err);
    }
    client.end();
    res.end(JSON.stringify(result.rows));
    });
  });
});

module.exports = router;