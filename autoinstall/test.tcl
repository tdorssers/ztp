# Zero-Touch Provisioning EEM Script
# This EEM script downloads and installs software, performs stack renumbering,
# applies a configuration template with $-based placeholders for variable
# substitutions and can execute commands upon script completion, such as smart
# licensing registration. A simple web server can be used to serve the script
# and software to the device and standard syslog server can be used for script
# monitoring. A default configuration file containing an EEM applet to download
# the script is loaded from a TFTP server specified by DHCP option 150.
#
# Adapt the SYSLOG, LOGAPI, JSON and DATA variables to your needs.
#
# Author:  Tim Dorssers
# Version: 1.0

::cisco::eem::event_register_none maxrun 900

namespace import ::cisco::eem::*
namespace import ::http::*

# errorInfo gets set by namespace if any of the auto_path directories do not
# contain a valid tclIndex file.
set errorInfo ""

# GLOBALS #####################################################################

# Syslog IP address string
set SYSLOG "10.0.0.1"
# URL to log API
set LOGAPI "http://10.0.0.1:8080/log"
# JSON is a string with URL of the JSON encoded DATA object as specified below.
set JSON "http://10.0.0.1:8080/data"

# DATA is a list of lists of key value pairs to define device data. To specify
# device defaults, omit 'stack' from one list. Empty list disables the internal
# data of the script. Valid keys and values are:
# 'stack'   : list with target switch number and serial number as pairs
# 'version' : string with target version used to determine if upgrade is needed
# 'base_url': string with base URL to optionally join with install/config URL
# 'install' : string with URL of target IOS to download
# 'config'  : string with URL of configuration template to download
# 'subst'   : list with key value pairs that match the placeholders
# 'cli'     : string of final IOS commands, or TCL if within {{...}}
# 'save'    : boolean to indicate to save configuration at script completion
# 'template': string holding configuration template with $-based placeholders
set DATA {}
#set DATA [list \
#[list base_url "http://10.0.0.1:8080/" \
#	version "16.6.4" \
#	cli "show inventory" \
#	install "./cat9k_iosxe.16.06.04.SPA.bin" \
#	save 1 \
#	template {hostname ${name}s
#			ip domain name $$lab
#			ip name-server 8.8.8.8
#			interface range $uplink1 , $uplink2
#			 description uplink}] \
#[list stack [list 3 "FCW2237D0LR" 1 "FCW2237G0L7" 2 "FOC2237X0DW"] \
#	"subst" [list name "switch1" \
#	uplink1 "Gi1/0/1" \
#	uplink2 "Gi2/0/1"]]]

# PROCEDURES ##################################################################

# Prints message to logbuf and syslog
proc log {priority msg} {
	global ztp
	append ztp(logbuf) "\n" $msg
	action_syslog priority $priority msg $msg
}

# Returns list of switch numbers and serials
proc getSerials {} {
	global errorInfo cli1
	# Get XML formatted output
	if [catch {xml_pi_exec $cli1(fd) "show inventory" ""} result] {
		error $result $errorInfo
	} else {
		# Iterate over all inventory entries
		foreach entry [regexp -all -inline "<InventoryEntry>(.*?)</InventoryEntry>" $result] {
			# Look for name and serial
			if [regexp "<ChassisName>(.*?)</ChassisName>" $entry -> name] {
				if [regexp "<SN>(.*?)</SN>" $entry -> sn] {
					# Non-stackable
					if {$name == "&quot;Chassis&quot;"} {
						set serials(0) $sn
					}
					# Stackable
					if [regexp "&quot;Switch (\[0-9])&quot;" $name -> unit] {
						set serials($unit) $sn
					}
				}
			}
		}
		return [array get serials]
	}
}

# Returns 1 if given url points to an ios xe package
proc isIosxePackage {url} {
	global errorInfo cli1
	if [catch {cli_exec $cli1(fd) "show file information $url"} result] {
		error $result $errorInfo
	} else {
		# Generate an error message if any
		if [regexp -line "^(%Error .*)" $result -> msg] {
			log err $msg
			shutdown 0 1
		}
		return [regexp "IFS|NOVA|IOSXE_PACKAGE" $result]
	}
}

# Returns software version string
proc getVersion {} {
	global errorInfo cli1
	if [catch {cli_exec $cli1(fd) "show version"} result] {
		error $result $errorInfo
	} else {
		# Extract version string
		if [regexp "Version (\[A-Za-z0-9.:()]+)" $result -> version] {
			# Remove leading zeros from numbers
			regsub -all {\m0+(\d)} $version {\1} verStr
		} else {
			set verStr "unknown"
		}
		# Extract boot string
		if [regexp {System image file is "(.*)"} $result -> image] {
			# Check if the device started in bundle mode
			if [isIosxePackage $image] {
				append verStr " bundle"
			}
		}
		return $verStr
	}
}

# Decode JSON data to list of lists structure with minimal validation
proc jsonToList {json} {
	set index 0
	set depth 0
	while {$index < [string length $json]} {
		if [regexp -indices -start $index {\S} $json range] {
			# Skip whitespaces
			set index [lindex $range 0]
		}
		if [regexp -indices -start $index {\A\"(.*?)\"} $json range sub] {
			# JSON string is between matching double quotes
			set value [string range $json [lindex $sub 0] [lindex $sub 1]]
			# Perform backslash substitutions
			append result [list [subst -nocommands -novariables $value]]
			# Continue decoding after JSON string
			set index [expr [lindex $range 1] + 1]
		}
		set char [string index $json $index]
		switch -- $char {
			\{ - \[ {
				# JSON object/array open brace/bracket
				incr depth
				if {$depth > 1} {
					append result "\{"
				}
			}
			\} - \] {
				# JSON object/array close brace/bracket
				if {$depth > 1} {
					append result "\} "
				}
				incr depth -1
			}
			: - , {
				# Colon and comma as separator
				append result " "
			}
			default {
				# JSON literals and numbers
				append result $char
			}
		}
		incr index
	}
	if {$depth != 0} {
		return -code error "invalid JSON"
	}
	return $result
}

# Lookup serials in JSON dataset
proc findStack {json serialsName} {
	upvar $serialsName serials
	foreach ele $json {
		array set temp $ele
		if {![info exists temp(stack)]} {
			# Absence of stack key indicates defaults
			array set target $ele
		} else {
			# Find at least one common serial number
			foreach num [array names serials] {
				if {[lsearch $temp(stack) $serials($num)] != -1} {
					array set target $ele
				}
			}
		}
		unset temp
	}
	return [array get target]
}

# Parse a URL into 3 components
proc urlsplit {url} {
	regexp {^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)} $url -> scheme netloc path
	return [list scheme $scheme netloc $netloc path $path]
}

# Join two URLs without resolving relative paths
proc urljoin {base url} {
	array set bparts [urlsplit $base]
	array set parts [urlsplit $url]
	set scheme [expr {[string length $parts(scheme)] ? $parts(scheme) : $bparts(scheme)}]
	if {![string equal $scheme $bparts(scheme)]} {
		return $url
	}
	if [string length $parts(netloc)] {
		return "$scheme://$parts(netloc)$parts(path)"
	}
	# Ignore all base path should the first character be root
	if [string match "/*" $parts(path)] {
		return "$scheme://$bparts(netloc)$parts(path)"
	}
	if {[string length $parts(path)] == 0} {
		return $base
	}
	set path "[string trim $bparts(path) "/"]/[string trimleft $parts(path) "./"]"
	return "$scheme://$bparts(netloc)/$path"
}

# Returns 1 if software is installed or 0 otherwise
proc install {targetName isChassis} {
	global ztp errorInfo cli1
	upvar $targetName target
	if {![info exists target(version)] || ![info exists target(install)]} {
		return 0
	}
	# Remove leading zeros from required version numbers and compare
	regsub -all {\m0+(\d)} [string trim $target(version)] {\1} verStr
	if [string equal $ztp(version) $verStr] {
		return 0
	}
	set installUrl [urljoin $target(base_url) $target(install)]
	# Terminate script in case of invalid file
	log info "Checking $installUrl"
	if {![isIosxePackage $installUrl]} {
		log err "$installUrl is not valid image file"
		shutdown 0 1
	}
	# Change boot mode if device is in bundle mode
	if [string match "*bundle" $ztp(version)] {
		set fs [expr {$isChassis ? "bootflash:" : "flash:"}]
		log info "Changing the Boot Mode"
		cli_exec $cli1(fd) "config t"
		cli_exec $cli1(fd) "no boot system"
		cli_exec $cli1(fd) "boot system [set fs]packages.conf"
		cli_exec $cli1(fd) "end"
		cli_exec $cli1(fd) "write memory"
		cli_exec $cli1(fd) "write erase"
		set confirm_bm 1
	} else {
		set confirm_bm 0
	}
	log info "Removing inactive images..."
	# From 16.5.x onwards
	cli_write $cli1(fd) "install remove inactive"
	if [catch {cli_read_pattern $cli1(fd) "\\\[y/n]|#"} result] {
		error $result $errorInfo
	}
	if [string match "*% Invalid input detected at '^' marker.*" $result] {
		# Up to and including 16.3.x
		cli_write $cli1(fd) "request platform software package clean"
		if [catch {cli_read_pattern $cli1(fd) "\\\[y/n]|#"} result] {
			error $result $errorInfo
		}
	}
	# Confirm proceed
	if [regexp {\[y/n]} $result] {
		cli_write $cli1(fd) "y"
		# Wait for command to complete and the router prompt
		cli_read $cli1(fd)
	}
	log info "Downloading and installing image..."
	# From 16.5.x onwards
	cli_write $cli1(fd) "install add file $installUrl activate commit"
	if [catch {cli_read_pattern $cli1(fd) "\\\[y/n/q]|#"} result] {
		error $result $errorInfo
	}
	if [string match "*% Invalid input detected at '^' marker.*" $result] {
		# Up to and including 16.3.x
		if {$confirm_bm} {
			cli_write $cli1(fd) "request platform software package expand switch all file $installUrl auto-copy"
			# Wait for command to complete and the router prompt
			cli_read $cli1(fd)
			return 1			
		} else {
			cli_write $cli1(fd) "request platform software package install switch all file $installUrl auto-copy"
		}
		if [catch {cli_read_pattern $cli1(fd) "\\\[y/n]|#"} result] {
			error $result $errorInfo
		}
	} else {
		# Do not save configuration
		if [regexp {\[y/n/q]} $result] {
			cli_write $cli1(fd) "n"
		} else {
			log err "Install failed"
			shutdown 0 1
		}
		if [catch {cli_read_pattern $cli1(fd) "\\\[y/n]|#"} result] {
			error $result $errorInfo
		}
	}
	# Confirm proceed
	if [regexp {\[y/n]} $result] {
		cli_write $cli1(fd) "y"
	} else {
		log err "Install failed"
		shutdown 0 1
	}
	if {$confirm_bm} {
		if [catch {cli_read_pattern $cli1(fd) "\\\[y/n]|#"} result] {
			error $result $errorInfo
		}
		# Confirm changed boot config
		if [regexp {\[y/n]} $result] {
			cli_write $cli1(fd) "y"
		} else {
			log err "Install failed"
			shutdown 0 1
		}
	}
	# Wait for command to complete and the router prompt
	cli_read $cli1(fd)
	return 1
}

# Returns 1 if autoupgrade is performed or 0 otherwise
proc autoupgrade {} {
	global errorInfo cli1
	if [catch {cli_exec $cli1(fd) "show switch"} result] {
		error $result $errorInfo
	} else {
		# Look for a switch in version mismatch state
		if [string match "*V-Mismatch*" $result] {
			cli_exec $cli1(fd) "request platform software package install autoupgrade"
			return 1
		} else {
			return 0
		}
	}
}

proc renumberStack {targetName serialsName} {
	global errorInfo cli1
	upvar $targetName target
	upvar $serialsName serials
	if {![info exists target(stack)]} {
		return 0
	}
	array set stack $target(stack)
	# Get current switch number and priorities as array
	if [catch {cli_exec $cli1(fd) "show switch"} switchResult] {
		error $switchResult $errorInfo
	}
	set match [regexp -all -inline {(\d)\s+\S+\s+\S+\s+(\d+)} $switchResult]
	# Renumber switches
	set renumber 0
	foreach old_num [array names serials] {
		# Lookup new switch number
		set new_num 0
		foreach n [array names stack] {
			if {$serials($old_num) == $stack($n)} {
				set new_num $n
			}
		}
		if {$new_num && $old_num != $new_num} {
			set renumber 1
			# Renumber switch
			cli_write $cli1(fd) "switch $old_num renumber $new_num"
			cli_write $cli1(fd) "\n"
			# Wait for command to complete and the router prompt
			cli_read $cli1(fd)
			log info "Renumbered switch $old_num to $new_num"
		}
		if {$new_num} {
			# Calculate new switch priority
			set new_prio [expr 16 - $new_num]
			# Lookup current switch priority
			set old_prio 1
			for {set i 1} {$i < [llength $match]} {incr i 3} {
				if {[lindex $match $i] == $old_num} {
					set old_prio [lindex $match [expr $i + 1]]
				}
			}
			if {$old_prio != $new_prio} {
				# Check if top switch is not active
				set first [lindex [lsort [array names serials]] 0]
				if {[string first "*$first" $switchResult] == -1} {
					set renumber 1
				}
				# Set switch priority
				cli_write $cli1(fd) "switch $old_num priority $new_prio"
				cli_write $cli1(fd) "\n"
				# Wait for command to complete and the router prompt
				cli_read $cli1(fd)
				log info "Switch $old_num priority set to $new_prio"
			}
		}
	}
	if {$renumber} {
		foreach num [array names serials] {
			# To prevent recovery from backup nvram
			cli_exec $cli1(fd) "delete /force flash-$num:nvram_config*"
		}
	}
	return $renumber
}

# Returns 1 if configuration template is applied successfully
proc applyConfig {targetName} {
	global errorInfo cli1
	upvar $targetName target
	set conf ""
	if {[info exists target(config)] && [string length $target(config)]} {
		set cfgUrl [urljoin $target(base_url) $target(config)]
		# HTTP GET request
		if [catch {set token [::http::geturl $cfgUrl]} msg] {
			log err $msg
			shutdown 0 1
		}
		# Remove keyword 'end' from downloaded configuration
		regsub -all -line {^\s*end\s*$} [::http::data $token] {} conf
		::http::cleanup $token
	}
	if [info exists target(template)] {
		append conf "\n$target(template)"
	}
	if {[string length $conf)] == 0} {
		return 0
	}
	# Build configuration from template by $-based substitutions
	if [info exists target(subst)] {
		array set temp $target(subst)
		set temp(\$) "$"
		regsub -all {(?:\$(\$))|(?:\$(\w+))|(?:\$\{(\w+)\})} $conf {$temp(\1\2\3)} conf
		set conf [subst -nocommands $conf]
	}
	# Apply configuration and log error message in case of failure
	set conf "config t\n$conf\nend"
	foreach line [split $conf "\n"] {
		if [catch {cli_exec $cli1(fd) $line} result] {
			error $result $errorInfo
		}
		# Remove superfluous line
		regsub "Enter configuration commands, one per line.  End with CNTL/Z.\r\n" $result {} result
		# Skip first and last line
		foreach ele [lrange [split $result "\n"] 1 end-1] {
			log err "Failed configuration: $ele"
		}
	}
	return 1
}

# Returns 1 if given command string is executed succesfully
proc finalCli {targetName} {
	global ztp errorInfo cli1
	upvar $targetName target
	if {![info exists target(cli)]} {
		return 0
	}
	foreach line [split $target(cli) "\n"] {
		# Look for TCL expressions within {{...}}
		if [regexp "{{(.*?)}}" $line -> command] {
			if [catch {eval $command} result] {
				error $result $errorInfo
			}
			regsub "{{(.*?)}}" $line $result line
			if {[string length $result] == 0} {
				continue
			}
		}
		# Execute command
		if [catch {cli_exec $cli1(fd) $line} result] {
			error $result $errorInfo
		} else {
			append ztp(cli) "---$line---\n\n$result\n\n"
		}
	}
	return 1
}

# Encode JSON object from list of keys and elements with minimal escaping
proc jsonFromList {data} {
	if {[expr {[llength $data] % 2}]} {
		error "invalid JSON data"
	}
	set comma {}
	set result \{
	foreach {key element} $data {
		append result $comma
		set comma ,
		append result \"$key\" : \"[string map {
			\x00 \\u0000    \x01 \\u0001    \x02 \\u0002    \x03 \\u0003
			\x04 \\u0004    \x05 \\u0005    \x06 \\u0006    \x07 \\u0007
			\x08 \\u0008    \x09 \\u0009    \x0a \\u000a    \x0b \\u000b
			\x0c \\u000c    \x0d \\u000d    \x0e \\u000e    \x0f \\u000f
			\x10 \\u0010    \x11 \\u0011    \x12 \\u0012    \x13 \\u0013
			\x14 \\u0014    \x15 \\u0015    \x16 \\u0016    \x17 \\u0017
			\x18 \\u0018    \x19 \\u0019    \x1a \\u001a    \x1b \\u001b
			\x1c \\u001c    \x1d \\u001d    \x1e \\u001e    \x1f \\u001f
			\\   \\\\       \"   \\\"
		} $element]\"
	}
	append result \}
	return $result
}

# Adds given key/values to named array and sends data to log API
proc upload {args} {
	global LOGAPI ztp
	foreach {key value} $args {
		set ztp($key) $value
	}
	if [info exists LOGAPI] {
		set data [jsonFromList [array get ztp]]
		# HTTP POST request
		if [catch {set token [::http::geturl $LOGAPI -query $data]} msg] {
			log err $msg
			shutdown 0 1
		}
		::http::wait $token
		if {[::http::ncode $token] != 200} {
			log err [::http::code $token]
			shutdown 0 1
		}
		::http::cleanup $token
	}
}

# Turns on blue beacon of given switch number list, if supported
proc blue_beacon {sw_nums} {
	global errorInfo cli1
	foreach num $sw_nums {
		# Up to and including 16.8.x
		cli_exec $cli1(fd) "config t"
		cli_exec $cli1(fd) "hw-module beacon on switch $num"
		cli_exec $cli1(fd) "end"
		# From 16.9.x onwards
		cli_exec $cli1(fd) "hw-module beacon slot $num on"
		log info "Switch $num beacon LED turned on"
	}
}

# Cleansup and saves config if needed and terminates script
proc shutdown {save abnormal} {
	global SYSLOG errorInfo cli1
	if {$save} {
		log info "Saving configuration upon script termination"
	}
	# Store script state to LOGAPI if specified
	upload status [expr {$abnormal ? "Failed" : "Finished"}]
	if [info exists SYSLOG] {
		cli_exec $cli1(fd) "config t"
		cli_exec $cli1(fd) "no logging host $SYSLOG"
		cli_exec $cli1(fd) "no logging discriminator ztp"
		cli_exec $cli1(fd) "end"
	}
	if {$save} {
		cli_exec $cli1(fd) "write memory"
	}
	if [catch {cli_close $cli1(fd) $cli1(tty_id)} result] {
		error $result $errorInfo
	}
	# Terminate script with exit status
	exit $abnormal
}

# MAIN ########################################################################

if [catch {cli_open} result] {
	error $result $errorInfo
} else {
	array set cli1 $result
}
if [catch {cli_exec $cli1(fd) "enable"} result] {
	error $result $errorInfo
}
# Setup IOS syslog for our own messages if server IP is specified
if [info exists SYSLOG] {
	cli_exec $cli1(fd) "config t"
	cli_exec $cli1(fd) "logging discriminator ztp msg-body includes HA_EM|INSTALL"
	cli_exec $cli1(fd) "logging host $SYSLOG discriminator ztp"
	cli_exec $cli1(fd) "end"
	after 2000
}
# Show script name
log info "*** Running [file tail [lindex $argv 0]] ***"
if [catch {lappend DATA} msg] {
	log err $msg
	shutdown 0 1
}
# Load JSON formatted data if URL is specified and concatenate it to DATA
if [info exists JSON] {
	if [catch {set token [::http::geturl $JSON]} msg] {
		log err $msg
		shutdown 0 1
	}
	set data [concat $DATA [jsonToList [::http::data $token]]]
	::http::cleanup $token
} else {
	set data $DATA
}
# Get platform serial numers and software version
array set serials [getSerials]
set temp {}
foreach num [array names serials] {
	lappend temp $serials($num)
}
log info "Platform serial number(s): [join $temp ", "]"
set ztp(version) [getVersion]
log info "Platform software version: $ztp(version)"
# Lookup stack in dataset
array set target [findStack $data serials]
if {![info exists target(stack)]} {
	log warning "% Stack not found in dataset"
	blue_beacon [array names serials]
	set first [lindex [lsort [array names serials]] 0]
	catch {set ztp(serial) $serials($first)}
} else {
	array set stack $target(stack)
	set first [lindex [lsort [array names stack]] 0]
	set ztp(serial) $stack($first)
	set temp [array get serials]
	# Check if all specified switches are found
	set missing {}
	foreach num [array names stack] {
		if {[lsearch $temp $stack($num)] == -1} {
			lappend missing $stack($num)
		}
	}
	if [llength $missing] {
		log warning "Missing switch(es): [join $missing {, }]"
		blue_beacon [array names serials]
	}
	# Check if all found switches are specified
	set extra {}
	foreach num [array names serials] {
		if {[lsearch $target(stack) $serials($num)] == -1} {
			lappend extra $serials($num)
		}
	}
	if [llength $extra] {
		log warning "Extra switch(es): [join $extra {, }]"
		blue_beacon [array names serials]
	}
}
set isChassis [expr [lsearch 0 [array names serials]] != -1]
# First, check version and install software if needed
if {[install target $isChassis]} {
	log info "Software upgraded, reloading stack..."
	upload status "Upgrading"
	action_reload
} else {
	# Second, check v-mismatch and perform autoupgrade if needed
	if {!$isChassis && [autoupgrade]} {
		log info "Autoupgraded, reloading stack..."
		upload status "Upgrading"
		action_reload
	} else {
		# Third, check switch numbering and renumber stack if needed
		if {!$isChassis && [renumberStack target serials]} {
			log info "Stack renumbered, reloading stack..."
			upload status "Renumbered"
			action_reload
		} else {
			log info "No need to renumber stack"
			# Fourth, apply configuration template if specified
			if {[applyConfig target]} {
				log info "Configuration template applied successfully"
			}
			# Fifth, execute final cli if specified
			if {[finalCli target]} {
				log info "Final command(s) executed successfully"
			}
			# Cleanup after step 4 or 5 and save config if specified
			log info "End of workflow reached"
			if [info exists target(save)] {
				shutdown $target(save) 0
			} else {
				shutdown 0 0
			}
			if [catch {cli_close $cli1(fd) $cli1(tty_id)} result] {
				error $result $errorInfo
			}
		}
	}
}
exit