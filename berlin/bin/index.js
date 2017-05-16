'use strict'

const ProgressBar = require('progress')
const async = require('async')
const URL = require('url')
const pr = require('path').resolve
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

const OUTPUT_DIR = pr(__dirname, '../output')

function scrape (url, method = 'GET', formdata) {
  return new Promise(function (resolve, reject) {
    scraper({
      url: url,
      type: 'html',
      method: method,
      form: formdata,
      jar: true
    }, function (err, $) {
      if (err) {
        reject(err)
      } else {
        resolve($)
      }
    })
  })
}

function parseSchoollist ($) {
  let url = 'http://www.berlin.de/sen/bildung/schulverzeichnis_und_portraets/anwendung/SchulListe.aspx'
  let $rows = $('#DataListSchulen tr')
  let schools = $rows.map((i, tr) => ({
    id: $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').attr('href').split('?IDSchulzweig=')[1].trim(),
    code: $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').text().trim(),
    entryURL: URL.resolve(url, $(tr).find('[id^=DataListSchulen_HLinkSchulNr_]').attr('href')),
    name: $(tr).find('[id^=DataListSchulen_lblSchulName_]').text().trim(),
    type: $(tr).find('[id^=DataListSchulen_lblSchulart_]').text().trim(),
    bezirk: $(tr).find('[id^=DataListSchulen_lblBezirk_]').text().trim(),
    ortsteil: $(tr).find('[id^=DataListSchulen_lblOrtsteil_]').text().trim()
  })).get()
  return schools
}

function getSchoolList (schools, postdata, index) {
  return new Promise(function (resolve, reject) {
    console.log('Fetching overview of all schools...')
    scrape('https://www.berlin.de/sen/bildung/schule/berliner-schulen/schulverzeichnis/SchulListe.aspx', 'POST', postdata)
      .then(($) => {
        var newSchools = parseSchoollist($)
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
  // .then(schools => schools.filter(school => school.name === 'Albert-Einstein-Gymnasium'))
  .then(schools => {
    let bar = new ProgressBar('Fetching details, current id: :token [:bar] (:current/:total, :eta seconds remaining)', { total: schools.length })

    async.eachSeries(schools, (school, schoolDone) => {
      let outputPath = pr(OUTPUT_DIR, school.id + '.json')
      try {
        JSON.parse(fs.readFileSync(outputPath))
        bar.tick({ token: school.code })
        return schoolDone()
      } catch (e) {
        // if (e.code !== 'ENOENT') throw e
      }
      fetchSchool(school)
        .then(school => {
          bar.tick({ token: school.id })
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
        .map(file => JSON.parse(fs.readFileSync(pr(OUTPUT_DIR, file))))
      fs.outputFileSync('schools.json', JSON.stringify(data))
      console.log(`Done, wrote results to ${pr(__dirname, 'schools.json')}`)
    })
  })
  .catch(e => console.error(e.stack))
