import multiparty from 'multiparty';
import Promise from 'bluebird';

export function parseFormData (req) {
  var form = new multiparty.Form();
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }
      return resolve({ fields, files });
    });
  });
}
