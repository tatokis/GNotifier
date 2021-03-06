/**
* The main module of the 'GNotifier' Add-on.
* Author: Michal Kosciesza <michal@mkiol.net>
* Contributor: Alexander Schlarb <alexander1066@xmine128.tk>
* 
* version: 1.8.0
*/

// imports

var data = require('sdk/self').data;
var _ = require('sdk/l10n').get;

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");

var ps = require('sdk/preferences/service');
var sps = require("sdk/simple-prefs").prefs;
var system = require("sdk/system");

var libc;

var downloadProgressListener = {
  onDownloadStateChange: function(aState, aDownload) {
    //console.log("onDownloadStateChange");	
    var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    var icon = getIcon();
    switch(aDownload.state) {
    case dm.DOWNLOAD_FINISHED:
      notify2(icon, _("download_finished"), aDownload.displayName);
      break;
    case dm.DOWNLOAD_FAILED:
      notify2(icon, _("download_finished"), aDownload.displayName);
      break;
    }
  }
}

function newDownloadProgressListener(download) {
  //console.log("newDownloadProgressListener");
  //console.log("download.succeeded", download.succeeded);
  //console.log("download.progress", download.progress);
  //console.log("source.url", download.source.url);
  //console.log("target.path", download.target.path);
  if(download.succeeded) {
    var icon = getIcon();
    var filename = download.target.path.replace(/^.*[\\\/]/, '');
    notify2(icon, _("download_finished"), filename);
  }
}

try {
Task.spawn(function () {
  let list = yield Downloads.getList(Downloads.ALL);
  let view = {
    onDownloadChanged: download => newDownloadProgressListener(download)
  };
  yield list.addView(view);
}).then(null, Cu.reportError);
}  catch(e) {
      console.log("spawn exeption");
    }

function AlertsService()
{}
AlertsService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

  showAlertNotification: function GNotifier_AlertsService_showAlertNotification(
    imageUrl, title, text, textClickable, cookie, alertListener, name
    )
  {
    //console.log('showAlertNotification');
    //console.log('imageUrl='+imageUrl);
    //console.log('title='+title);
    //console.log('text='+text);
    //console.log('textClickable='+textClickable);
    //console.log('cookie='+cookie);
    //console.log('alertListener='+alertListener);
    //console.log('name='+name);

    //TODO: Support textClickable (Yes its possible using a button...)
    function GNotifier_AlertsService_showAlertNotification_cb(iconPath)
    {
      // Display notification
      notify2(iconPath, title, text, name);

      //TODO: Call the callback once the alert is actually finished...
      if(typeof(alertListener) == "object") {
	alertListener.observe(null, "alertfinished", cookie);
	}
    }

    try {
      // Try using a local icon file URL
      var imageURI = NetUtil.newURI(imageUrl);
      var iconFile = imageURI.QueryInterface(Ci.nsIFileURL).file;

      // Success!
      GNotifier_AlertsService_showAlertNotification_cb(iconFile.path);
      } catch(e) {
	try {
  // Create temporary local file
  // (Required since I don't want to manually
  //  populate a GdkPixbuf...)
  var iconFile = FileUtils.getFile("TmpD", [".gnotifier.tmp"]);
  iconFile.createUnique(
    Ci.nsIFile.NORMAL_FILE_TYPE,
    FileUtils.PERMS_FILE
    );
  var iconStream = FileUtils.openSafeFileOutputStream(iconFile);

  // Copy data from original icon to local file
  var imageFile = NetUtil.newChannel(imageUrl);
  NetUtil.asyncFetch(imageFile, function(imageStream)
    {
      NetUtil.asyncCopy(imageStream, iconStream, function()
	{
    // Show notification with copied icon file
    GNotifier_AlertsService_showAlertNotification_cb(
      iconFile.path
      );

    // Close streams
    iconStream.close();
    imageStream.close();

    // Delete icon file
    iconFile.remove(false);
  });
    });
  } catch(e) {
    GNotifier_AlertsService_showAlertNotification_cb(imageUrl);
    }
	}
  }
};

function getIcon() {
  var picon = sps['notifyIcon'];
  if (picon == "default") {
      
    if (system.name == "Iceweasel")
      picon = "iceweasel";
    if (system.name == "Thunderbird")
      picon = "thunderbird";
    if (system.name == "Firefox")
      picon = "firefox";

    // default Firefox icon
    if (picon == "default")
      picon = "firefox";
  }
  return picon;
}

function importLibnotify() {
  try {
    libc = ctypes.open("libnotify.so.4");
    return true;
  } catch (e) {
    try {
      libc = ctypes.open("/usr/local/lib/libnotify.so.4");
      return true;
    } catch (e) {
      return false;
    }
  }
}

function notify1(iconURL, title, text) {
  //console.log('notify1');
  //console.log('iconURL='+iconURL);
  //console.log('title='+title);
  //console.log('text='+text);
  var notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: iconURL
  });
}

function notify2(iconURL, title, text, notifier) {
  //console.log('notify2');
  //console.log('iconURL='+iconURL);
  //console.log('title='+title);
  //console.log('text='+text);
  const struct_gerror = new ctypes.StructType("GError",
    [ { "gerror_domain": ctypes.uint32_t },
      { "gerror_code": ctypes.int },
      { "gerror_message": ctypes.char.ptr }]);    
  const struct_gerror_ptr = new ctypes.PointerType(struct_gerror);
  const struct_notification = new ctypes.StructType("NotifyNotification");

  var notify_init = libc.declare("notify_init", ctypes.default_abi, ctypes.bool, ctypes.char.ptr);    
  var notify_is_initted = libc.declare("notify_is_initted", ctypes.default_abi, ctypes.bool);
  var notify_notification_new = libc.declare(
    "notify_notification_new", ctypes.default_abi,
    struct_notification.ptr, ctypes.char.ptr,
    ctypes.char.ptr, ctypes.char.ptr);  
  var notify_notification_show = libc.declare(
    "notify_notification_show", ctypes.default_abi, ctypes.bool,
    struct_notification.ptr, struct_gerror_ptr);
  //console.log(notifier);
  //console.log(typeof(notifier));
  //console.log(notifier == "");
  notify_init((typeof(notifier) == "string" && notifier != "") ? notifier : "gnotifier");
  var error = new struct_gerror_ptr;
  var ret = notify_notification_show(
    notify_notification_new(title,text,iconURL),error);

  if(!ret) {
    console.log('error!');
    notify1(iconURL, title, text);
  }

}

function setConfig() {
  ps.set("browser.download.manager.showAlertOnComplete", false);
}

function restoreOrigConfig() {
  ps.set("browser.download.manager.showAlertOnComplete", true);
}

exports.main = function(options, callbacks) {
  //console.log("exports.main, loadReason=" + options.loadReason);
  //console.log("system.platform=" + system.platform);
  //console.log("system.name=" + system.name);
  //console.log("system.vendor=" + system.vendor);
  // check if libnofify.so.4 is present
  if(importLibnotify()) {
    // Register download manager hook
    // Disabled in FF 26
    try {
      var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
      dm.addListener(downloadProgressListener);
    } catch(e) {
      console.log("dm exeption");
    }

    if(sps['replaceAlerts']) {
      // Replace alert-service
      var contract = "@mozilla.org/alerts-service;1";
      let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
      // Unregister built-in alerts-service class factory
      registrar.unregisterFactory(
	Cc[contract],
	Cm.getClassObject(Cc[contract], Ci.nsIFactory)
      );

      // Register new factory
      registrar.registerFactory(
	Cc[contract],
	"GNotifier Alerts Service",
	contract,
	XPCOMUtils.generateSingletonFactory(AlertsService)
      );
    }
    setConfig();

  } else {
    restoreOrigConfig();
  }

/*require("widget").Widget({
  id: "widgetID1",
  label: "GNotifier",
  contentURL: "http://www.mozilla.org/favicon.ico",
  onClick: function(event) {
  notify2("firefox", _("download_finished"), _("download_finished"));
  }
});*/

};

exports.onUnload = function (reason) {
  restoreOrigConfig();
}

