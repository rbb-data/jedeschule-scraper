'use strict'

const ProgressBar = require('progress')
const async = require('async')
const URL = require('url')
const { resolve } = require('path')
const fs = require('fs-extra')
const Scrapyard = require('scrapyard')

var scraper = new Scrapyard({
  debug: true,
  retries: 5,
  connections: 10
  // cache: './storage',
  // bestbefore: "5min"
})

const fetchSchool = require('./lib/fetch-school')

const OUTPUT_DIR = resolve(__dirname, '../output')

function scrape (url, method = 'GET', formdata) {
  return new Promise(function (resolve, reject) {
    scraper({
      url: url,
      type: 'html',
      method: method,
      form: formdata,
      jar: true
    }, function (err, $) {
      console.log('hay')
      if (err) {
        reject(err)
      } else {
        resolve($)
      }
    })
  })
}

function parseSchoollist ($) {
    // let $ = cheerio.load(body)
  console.log('parseSchoolList')
  let url = 'http://www.berlin.de/sen/bildung/schulverzeichnis_und_portraets/anwendung/SchulListe.aspx'
  let $rows = $('#DataListSchulen tr')
  let schools = $rows.map((i, tr) => ({
    id: $(tr).find('a').attr('href').split('?IDSchulzweig=')[1],
    code: $(tr).find('a').text(),
    entryURL: URL.resolve(url, $(tr).find('a').attr('href')),
    name: $(tr).find('td:nth-child(2)').text(),
    type: $(tr).find('td:nth-child(3)').text(),
    bezirk: $(tr).find('td:nth-child(4)').text(),
    ortsteil: $(tr).find('td:nth-child(5)').text()
  })).get()
  console.log('got schools:', $rows.length)
  return schools
}

function getSchoolList (schools, postdata, index) {
  console.log('getSchoolList')
  return new Promise(function (resolve, reject) {
    scrape('https://www.berlin.de/sen/bildung/schule/berliner-schulen/schulverzeichnis/SchulListe.aspx', 'POST', postdata)
      .then(($) => {
        console.log('inside promise here')
        var newSchools = parseSchoollist($)
          // var $ = cheerio.load(data)
        var postdata = {
          '__EVENTTARGET': 'GridViewSchulen',
          '__EVENTARGUMENT': 'Page$' + (index + 1),
          '__VIEWSTATE': $('#__VIEWSTATE').attr('value'),
          '__VIEWSTATEGENERATOR': $('#__VIEWSTATEGENERATOR').attr('value'),
          '__VIEWSTATEENCRYPTED': $('#__VIEWSTATEENCRYPTED').attr('value'),
          '__EVENTVALIDATION': $('#__EVENTVALIDATION').attr('value')
        }
        schools = schools.concat(newSchools)

        if (newSchools.length === 41) {
          console.log('requesting page ' + (index + 1))
          return getSchoolList(schools, postdata, index + 1)
        } else {
          resolve(schools)
        }
      })
      .then((data) => {
        resolve(data)
      })
      .catch(console.log)
  })
}

getSchoolList([], {}, 1)
  .then(schools => schools.filter(school => school.name === 'Albert-Einstein-Gymnasium'))
  .then(schools => {
    let bar = new ProgressBar(':bar :percent (:token1)', { total: schools.length })

    async.eachSeries(schools, (school, schoolDone) => {
      let outputPath = resolve(OUTPUT_DIR, school.id + '.json')
      try {
        JSON.parse(fs.readFileSync(outputPath))
        bar.tick({ token: school.code })
        return schoolDone()
      } catch (e) {
        // if (e.code !== 'ENOENT') throw e
      }
      fetchSchool(school)
        .then(school => {
          bar.tick({ token: school.code })
          fs.outputFile(
            outputPath,
            JSON.stringify(school),
            schoolDone)
        })
        .catch(schoolDone)
    }, function allDone (err) {
      if (err) console.error(err.stack)
      let data = fs.readdirSync(OUTPUT_DIR)
        .filter(file => /\.json$/.test(file))
        .map(file => JSON.parse(fs.readFileSync(resolve(OUTPUT_DIR, file))))
      fs.outputFileSync('schools.json', JSON.stringify(data))
    })
  })
  .catch(e => console.error(e.stack))
