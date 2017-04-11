'''
The default translation file removes all the attributes
with empty values
'''

def filterTags(attrs):
  if not attrs: return

  tags = {}

  for k,v in attrs.iteritems():
    if v:
      tags.update({k: v})

  return tags