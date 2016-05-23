
function getUrlVars()
{
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
};
function setLang(lang) {
  var keys =getUrlVars();
  if(keys["lang"] !== undefined) {
    //we have a lang setting
    console.log(keys["lang"])
    if(lang!==keys["lang"]) {
      var url = '?';
      keys.forEach(function(key) {
        if (key == 'lang') {
          url = url+'&lang='+lang;
        }
        else if(key!==undefined&&key!=='') {
          url = url+'&'+key+'='+getUrlVars()[key];
        }
      })
      console.log(url)
      window.location.href=url;
    }
  }
  else if(window.location.href.indexOf('?')>-1) {
    // we have other parameters
    window.location.href=window.location.href+'&lang='+lang;
  }
  else {
    window.location.href='?lang='+lang;
  }
}
var lang = getUrlVars()["lang"];
jQuery.i18n.properties({
    name:'Messages', 
    path:'/i18n/', 
    mode:'both',
    language:lang,
    checkAvailableLanguages: true
});

function t(a,b,c){
  return  jQuery(document).ready(function() {         
    $(a).append(jQuery.i18n.prop(b,c))          
  })
}
jQuery(document).ready(function(){
  $('#lng_zh').on('click',function(){
     window.location.href='?lang=zh';
  })
  $('#lng_en').on('click',function(){
    window.location.href='?lang=en';
  })
  $('a').on('click',function(e){
    var llang = getUrlVars()["lang"];
    e.preventDefault();
    if(llang !== undefined) {
        if(this.href.indexOf('?')>-1) {
            var url = this.href+'&lang='+ llang;
        }
        else {
            var url = this.href+'?lang='+ llang;
        }
    }
    else url = this.href;
    window.location.href=url;
    return false;
  })
}); 

