##### Ján Čegiň
##### PDT 2018/19 Assignment

## Overview

This application displays castles in Slovakia. The castles are displayed as either point marks
or polygons in which case their coloring depends upon their area size.

The application also shows point of interests (buildings only) with different coloring based as to what kind of
building it is upon clicking on the castle marker. It also shows all the castles with parking lots in the approximity
of each other. On keystroke of the selected caslte point the pedestrian road network is showed within 500 metres from the castle
with the lengths of each path displayed on click. 
 
Last but not least, the castles are filtered to be within x number of km from given major city in Slovakia.
 
Below is the screen of the application with clustering based of castle points.


![alt text](screen.png "Screenshot")

### Project Structure

The magic happens in the files under `routes/` and `views/` directories. In the `routes` directory
the file `index.js` is located, where all the API endpoints are written as well as query builders used to 
interact with the database.

In the `views` three files are located. `index.jade` serves to extend the layout with adding
buttons, loading the map and adding the legends to it. `layout.jade` is the entry point where the
main javascript scripts are located to cluster, add events to points, etc.

### Map layout

The layout of the map was created from a basic theme using mapbox studio to edit it. 
Things that were changed include:

* change of water areas color
* leisure zone of parks was colored with subtle green to emphasize on the surroundings of castles
* change of font styles and sizes for names of cities
* added hillshade
* added mountain peak names
* change train station colors

### Database

The data were taken from [download.geofabrik.de](https://download.geofabrik.de/) for the latest version of Slovakia 
(website was accessed and data download on 5th November). 

To speed up specific queries I utilized indexes. For the `planet_osm_polygon` table the indexes 
are: 
* `index_polygons_on_historic_name`
* `index_polygons_on_building`
* `index_polygons_on_amenity`

For the `planet_osm_point` the indexes are:
* `index_points_on_historic_name`
* `index_points_on_place_population`

For the `planet_osm_line` the indexes are:
* `index_lines_on_highway`

### API and queries

#### GET `/castles` - return castles as point markers

This endpoint returns all the castles as point markers. First of all a UNION operation is used to 
get all the point and polygon castles (as if they are present in one table, they arent present in the other one).
Then a GROUP BY with name of the castle is used to `ST_Collect` given geometries, so we dont have
multiple points for each castle. 

Then, for the polygon/multipoint geometry a `ST_Centroid` is used to 
retrieve the centroid of given polygon/multipoints. This is done as join of the UNION and the multipoint/polygon subtable
to have given centroid for every distinct castle name.

Query:
```postgresql
with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point 
      WHERE historic in ('castle') and name is not null 
      UNION 
      SELECT osm_id,historic,name,ST_Centroid(way) AS geometry FROM planet_osm_polygon 
      WHERE historic in ('castle') and name is not null), multipoints as(
      Select name, ST_Collect(points.geometry) as geometry FROM castle_points as points GROUP BY name)
      select DISTINCT ON (gp.name) gp.name, gp.osm_id, gp.historic, ST_AsGeoJSON(ST_Transform(ST_Centroid(points.geometry),4326)) AS geometry from castle_points as gp 
      JOIN multipoints points ON gp.name = points.name
```

#### GET `/castles-poly` - return castles with their area size

First of all, from the polygons using `ST_Area` an area size is calculated and GROUP BY name to 
ensure that we have a complete area size for the castle, even if it consists of multiple buildings.
Their geometries are preserved using `ST_Union` to create a multipolygon. 

The last thing is the UNION of the table on itself with the exception of the second one returning a centroid
to represent the castle as a pointer also. The coloring is then handled by the server.

Query:
```postgresql
with castle_areas as( SELECT osm_id,historic,name,way AS geometry, ST_Area(way)*POWER(0.3048,2) as area  FROM planet_osm_polygon 
    WHERE historic in ('castle') and name is not null),
    total_areas as(select name,  SUM(area) AS totalarea from castle_areas GROUP BY name),
    grouped_areas as(
    select distinct on (cas.name) cas.name, cas.geometry, areas.historic, areas.osm_id, cas.area as totalarea FROM
    (select name, (ST_Union(f.geometry)) as geometry, SUM(area) as area FROM castle_areas As f GROUP BY f.name) cas JOIN castle_areas areas ON areas.name = cas.name)
    Select * from (select osm_id, name, ST_AsGeoJSON(ST_Transform(geometry,4326)) as geometry, round(totalarea::numeric, 2) as totalarea  from grouped_areas
    UNION
    select osm_id, name, ST_AsGeoJSON(ST_Transform(ST_Centroid(geometry),4326)) as geometry, round(totalarea::numeric, 2) as totalarea from grouped_areas) as final_result ORDER BY final_result.totalarea DESC
```


#### GET `/closeParking?num=500` - return all castles with parking lots near them in meters
In this case we first get a set of points representing castles and then all the polygons which are parking lots. Then,
using a CROSS JOIN with a WHERE clause for the `ST_DWithin` using the supplied `num` parameter from the query we get all
the castles and parking lots. To get them both, we do a union splitting the columns and joining them together with distinct on the value of the id.

Query:
```postgresql
with park_poi as (
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
        FROM park_poi) as park_poi;
```

#### GET `/closeTowns?id=123&num=500` - return all castles which are x km away from the given city
Quite a simple query to return all castles within the proximity of given town in km using the `ST_Distance` and WHERE 
clause to check if its from the proximity of the town.

Query:
```postgresql
Select osm_id, name, ST_AsGeoJSON(ST_Transform(way,4326)) AS geometry, historic 
      from (SELECT osm_id,name,way, historic
      FROM planet_osm_point WHERE historic in ('castle') and name is not null 
      UNION SELECT osm_id,name,ST_Centroid(way) AS way, historic
      FROM planet_osm_polygon WHERE historic in ('castle') and name is not null) as data
      where ST_Distance(data.way, (Select way from planet_osm_point points where osm_id=$1)) < $2
```


#### GET `/closeInterests?id=123&num=500` - return all PoI for the given castle within x meters
In this case points of castles are selected like in `castles` case and all polygons which represent buildings are returned.
They are then colored by the Server part of the application. `ST_DWithin` is used for distance measurement as we dont know
where the entrance to the building is.

Query:
```postgresql
with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point 
      WHERE historic in ('castle') and name is not null 
      UNION 
      SELECT osm_id,historic,name,ST_Centroid(way) AS geometry FROM planet_osm_polygon 
      WHERE historic in ('castle') and name is not null), multipoints as(
      Select name, ST_Collect(points.geometry) as geometry FROM castle_points as points GROUP BY name), finalpoints as (
      select DISTINCT ON (gp.name) gp.name, gp.osm_id, gp.historic, ST_Centroid(points.geometry) AS geometry from castle_points as gp JOIN multipoints points ON gp.name = points.name)  
      select osm_id, name, ST_AsGeoJSON(ST_Transform(way,4326)) AS geometry, historic, amenity, tourism, man_made, leisure, shop from planet_osm_polygon as pol where name is not null and building in ('yes') and ST_DWithin(pol.way, (select geometry from finalpoints where osm_id=$1), $2)
```

#### GET `/roads?id=123` - return pedestrian road network in proximity of the castle
First the castle points are selected as shown above. Then, all lines are selected, which are of types 'footway', 'steps', 'pedestrian' or 'footpath'
only if they are atleast partially inside a circle created by the `ST_Buffer` function. However, to show not the entire way/road,
`ST_Intersection` is used to get only that part of the road, which is actually intersecting the circle/buffer.
Then the geometry is transformed and length of the line is also calculated using `ST_Length`. The length is then shown in the 
description of the road. The road network is then colored via server part of the application.

Query:
```postgresql
with castle_points as (SELECT osm_id,historic,name,way AS geometry FROM planet_osm_point  
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
      select highway, ST_AsGeoJSON(ST_Transform(way,4326)) as geometry, round(ST_Length(way)::numeric, 2) as len from highways
```

