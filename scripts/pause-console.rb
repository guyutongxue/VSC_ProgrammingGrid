#!/usr/bin/ruby
###
# https://github.com/Guyutongxue/VSCodeConfigHelper3/blob/main/scripts/pause-console.rb
# Modified for redirecting input

require 'io/console'

if ARGV.length == 0 then
  puts "Usage: #{__FILE__} <Executable> [<InputFile>]"
  exit
end

command_line = ARGV.map { |arg| %|"#{arg.gsub('"', '\"')}"| }
start_time = Time.now
if ARGV.length == 1 then
  system("#{command_line[0]}")
else
  system("#{command_line[0]} < #{command_line[1]}")
end
exit_code = $?.exitstatus
end_time = Time.now
elapsed_time = "%.4f" % (end_time - start_time)

puts
print "----------------"
RESET = "\033[0m"
BG_RED = "\033[41m"
BG_GREEN = "\033[42m" 
BG_YELLOW_FG_BLACK = "\033[43;30m"
FG_RED = "\033[0;31m"
FG_GREEN = "\033[0;32m"
FG_YELLOW = "\033[0;33m"
# PowerLine Glyphs < and >
GT="\ue0b0"
LT="\ue0b2"
if exit_code == 0 then
    exit_fg_color = FG_GREEN
    exit_bg_color = BG_GREEN
else
    exit_fg_color = FG_RED
    exit_bg_color = BG_RED
end
print "#{exit_fg_color}#{LT}#{RESET}"
print "#{exit_bg_color} 返回值 #{exit_code} #{RESET}"
print "#{BG_YELLOW_FG_BLACK} 用时 #{elapsed_time}s #{RESET}"
print "#{FG_YELLOW}#{GT}#{RESET}"
puts "----------------"
puts "进程已退出。按任意键退出..." # "close window" is controlled by Terminal.app preference
STDIN.getch