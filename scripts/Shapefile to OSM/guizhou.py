#!/usr/bin/env python
# -*- coding: utf-8 -*-

'''
This translation file adds a __LAYER field to a datasource before translating it

Copyright (c) 2012 Paul Norman
<penorman@mac.com>
Released under the MIT license: http://opensource.org/licenses/mit-license.php

'''

def filterTags(attrs):
    if not attrs: return
    
    tags = {}
    
    if attrs['Class']:
        tags.update({'highway':attrs['Class']})
    if attrs['ID']:
        tags.update({'id':attrs['ID']})
    if attrs['township_p']:
        tags.update({'TownshipUpgrade':attrs['township_p']})
    if attrs['county_p']:
        tags.update({'CountryUpgrade':attrs['county_p']})
        
    return tags