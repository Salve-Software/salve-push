require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "SalvePushNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/salvesoftware/salve-push.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{h,m,mm}",
    "cpp/**/*.{h,hpp,cpp}",
  ]
  s.exclude_files = "ios/Tests/**/*"

  s.public_header_files = "ios/SalvePushCrashHandlerBridge.h"

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'

  load 'nitrogen/generated/ios/SalvePushNative+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
