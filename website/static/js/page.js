Artemis.LogLine = Backbone.Model.extend({
    initialize: function(options) {
        this.id = parseInt(options.el.attr('id').slice(9), 10);
        options.model = this;
        this.view = new Artemis.LogLineView(options);
    },

    getURL: function() {
        return this.view.el.find('.time a').attr('href');
    },

    getTimestamp: function() {
        return this.getURL().split('/')[1];
    }

});

Artemis.HighlightedLogLineCollection = Backbone.Collection.extend({
    model: Artemis.LogLine,
    
    comparator: function(line) {
        return line.id;
    },

    add: function(model, options) {
        Backbone.Collection.prototype.add.call(this, model, options);
        this.highlight();
    },
    
    remove: function(model, options) {
        model.view.unHighlight();
        Backbone.Collection.prototype.remove.call(this, model, options);
        this.highlight();
    },

    // This could be more efficient by working it out in _add and _remove
    highlight: function() {
        this.each(_.bind(function(line) {
            line.view.highlight();
        }, this));
    },

    getURL: function() {
        var first = this.first().getURL().split('/')[1];
        var last = this.last().getURL().split('/')[1];
        var out = [document.location.origin, '/', first, '/'];
        if (first != last) {
            out.push(last);
            out.push('/');
        }
        out.push('#show-selection');
        return out.join('');
    }
});

Artemis.LogLineView = Backbone.View.extend({
    events: {
        'click dd #expand-previous':  'expandPrevious',
        'click dd #expand-next':      'expandNext',
        'click dd #contract-previous': 'contractPrevious',
        'click dd #contract-next':    'contractNext'
    },

    rangeAdvisoryTemplate: '<p id="range-advisory">Spoken on <%= time %><span>. </span><i>Link to this<span> transcript range is</span>:</i> <input type="text" name="" value="<%= permalink %>"></p>',

    highlight: function() {
        this.el.addClass('highlighted');
        this.el.css({'cursor': 'auto'});

        // Reset range UI
        this.el.find('.range-ui').remove();
        
        if (this.model.collection.first().id == this.model.id) {
            this.el.addClass('first');
            if (this.previousElement()) {
                this.addRangeUI('expand-previous');
            }
            else if (Artemis.transcriptView.loadPreviousButton) {
                Artemis.transcriptView.loadPreviousButton.loadMore();
            }

            this.addRangeUI('selection-close');
            if (this.model.collection.size() > 1) {
                this.addRangeUI('contract-previous');
            }
        }
        else {
            this.el.removeClass('first');
        }
        this.removeRangeAdvisory();
        if (this.model.collection.last().id == this.model.id) {
            this.el.addClass('last');
            if (this.nextElement()) {
                this.addRangeUI('expand-next');
            }
            else if (Artemis.transcriptView.loadMoreButton) {
                Artemis.transcriptView.loadMoreButton.loadMore();
            }
            if (this.model.collection.size() > 1) {
                this.addRangeUI('contract-next');
            }
            this.createRangeAdvisory();
        }
        else {
            this.el.removeClass('last');
        }
    },

    unHighlight: function() {
        this.el.removeClass('highlighted first last');
        this.el.css({'cursor': 'pointer'});
        this.el.find('.range-ui').remove();
        this.removeRangeAdvisory();
    },

    addRangeUI: function(id) {
        var href = '#';
        if (id == 'selection-close') {
            href = '/page/'+this.model.getTimestamp()+'/#log-line-'+this.model.id;
        }
        this.el.children('dd').append('<a href="'+href+'" class="range-ui" id="'+id+'"></a>');
    },

    expandPrevious: function() {
        var prev = this.previousElement();
        if (prev) {
            var line = new Artemis.LogLine({el: prev});
            this.model.collection.add(line);
        }
        return false;
    },
    expandNext: function() {
        var next = this.nextElement();
        if (next) {
            var line = new Artemis.LogLine({el: next});
            this.model.collection.add(line);
        }
        return false;
    },
    contractPrevious: function() {
        this.model.collection.remove(this.model.collection.first());
        return false;
    },
    contractNext: function() {
        this.model.collection.remove(this.model.collection.last());
        return false;
    },
    createRangeAdvisory: function() {
        if (!this.el.children('#range-advisory').length) {
            var rangeAdvisory = $(_.template(this.rangeAdvisoryTemplate, {
                time: this.model.collection.first().view.el.find('time').data('range-advisory'),
                permalink: this.model.collection.getURL()
            }));
            // Select text in text field on focus
            rangeAdvisory.find('input').click(function() {
                $(this).focus().select();
            });
            this.el.append(rangeAdvisory);
        }
    },
    removeRangeAdvisory: function() {
        this.el.find('#range-advisory').remove();
    },
    previousElement: function() {
        var el = this.el.prevAll('div').get(0);
        if (el) {
            return $(el);
        }
    },
    nextElement: function() {
        var el = this.el.nextAll('div').get(0);
        if (el) {
            return $(el);
        }
    }

});

Artemis.LoadMoreButtonView = Backbone.View.extend({
    events: {
        'click a':  'loadMore',
    },

    initialize: function(options) {
        _.bindAll(this, 'loadMore', 'loadMoreCallback');
        this.isPrevious = options.isPrevious;
    },

    loadMore: function() {
        var a = this.el.children('a');
        if (a.size()) {
            this.elLast = this.el.clone();
            $.getJSON(a.attr('href')+'?json', this.loadMoreCallback);
            Artemis.replaceWithSpinner(a);
        }
        return false;
    },

    loadMoreCallback: function(data) {
        var content = $(data.content);
        var crest = $(data.crest);

        // To start with, get rid of the spinner
        this.el.children().replaceWith(this.elLast.clone().children());
        
        // We've hit the start of a new phase
        if (crest.children().size()) {
            // If we're going backwards, show the new crest
            if (this.isPrevious) {
                $('#crest').replaceWith(data.crest);
            }
            // Don't load anything if we're highlighted and reached the end of
            // a phase
            else if (Artemis.transcriptView.highlightedLines.size()) {
                return;
            }
            // If going forwards, skip to next phase 
            else {
                window.location = this.elLast.children('a').attr('href');
            }
        }
        
        // See if the new content has a spinner
        var newEl = content.find('#'+this.el.attr('id'));
        if (newEl.size() && newEl.children().size()) {
            this.el.children().replaceWith(newEl.children());
        }
        else {
            this.el.children().remove();
        }

        // With lines highlighted, hide the button
        if (Artemis.transcriptView.highlightedLines.size()) {
            this.el.hide();
        }
        
        // Insert new lines
        if (this.isPrevious) {
            $('#transcript').prepend(content.filter('#transcript').children());
        }
        else {
            $('#transcript').append(content.filter('#transcript').children());
        }

        // Rehighlight all rows to add any missing "+" buttons
        Artemis.transcriptView.highlightedLines.highlight();

        // Readjust height of overlay
        Artemis.transcriptView.setOverlayHeight();
    },

    hide: function() {
        this.el.children().fadeOut();
    },

    show: function() {
        this.el.children().fadeIn();
    }
});


Artemis.TranscriptView = Backbone.View.extend({
    el: $('#transcript').parent(),
    overlay: $('<div id="highlight-overlay"></div>'),
    events: {
        'click #transcript > div':  'highlightLine',
        'click #transcript > div dd #selection-close': 'selectionClose'
    },
    // The log lines which are currently highlighted
    highlightedLines: new Artemis.HighlightedLogLineCollection(),
    
    initialize: function() {
        _.bindAll(this, 'selectionClose');

        if ($('#load-previous').size()) {
            this.loadPreviousButton = new Artemis.LoadMoreButtonView({
                el: $('#load-previous'),
                isPrevious: true,
            });
        }
        if ($('#load-more').size()) {
            this.loadMoreButton = new Artemis.LoadMoreButtonView({
                el: $('#load-more'),
            });
        }

        this.overlay.click(this.selectionClose);
        this.el.find('#transcript').css({'cursor': 'pointer'});
        
        // Bust through the div's click event to allow all links to work apart from 
        // the time link
        this.el.find('#transcript > div a').click(function(e) {
            if ($(e.currentTarget).parent().hasClass('time')) {
                return this.highlightLine(e);
            }
            e.stopImmediatePropagation();
            return true;
        });
    },

    gatherCurrentSelection: function() {
        // Gather any currently selected lines
        _.each($('#transcript > .highlighted'), _.bind(function(e) {
            this.highlightedLines.add(
                new Artemis.LogLine({el: $(e)})
            );
        }, this));
    },

    highlightLine: function(e) {
        if (this.highlightedLines.size() == 0) {
            var target = $(e.currentTarget).closest('div');
            var line = new Artemis.LogLine({el: target});
            this.highlightedLines.add(line);
            
            if (this.loadPreviousButton) this.loadPreviousButton.hide();
            if (this.loadMoreButton) this.loadMoreButton.hide();

            this.showOverlay();
            line.view.el.find('#range-advisory').hide().show('blind');
        }
        return false;
    },

    selectionClose: function(e) {
        // TODO: we should keep track of what page we're on
        if (location.pathname.slice(0, 6) == '/page/') {
            this.el.find('#range-advisory').hide('blind', _.bind(function() {
                this.highlightedLines.each(function(line) {
                    line.view.unHighlight();
                });
                this.highlightedLines = new Artemis.HighlightedLogLineCollection();

            }, this));
            this.hideOverlay();
            if (this.loadPreviousButton) this.loadPreviousButton.show();
            if (this.loadMoreButton) this.loadMoreButton.show();
            return false;
        }
        // If we're on a log line highlight page, fall through to linking back
        // to the page
        else {
            // For whatever goddamn reason, letting the normal click event fall
            // through doesn't work. Probably something to do with another
            // click even intefering
            window.location = $(e.currentTarget).attr('href');
            return true;
        }
    },

    showOverlay: function() {
        this.overlay.css({
            'background-color': 'black',
            'opacity': '0'
        });
        this.setOverlayHeight();
        this.overlay.appendTo($('body'));
        this.overlay.animate({'opacity': '0.5'});
    },

    setOverlayHeight: function() {
        this.overlay.css({
            'height': ($('body').height() - 38) + 'px'
        });
    },

    hideOverlay: function() {
        this.overlay.animate({'opacity': 0}, _.bind(function() {
            this.overlay.detach();
        }, this));
    }

});


Artemis.PhasesView = Backbone.View.extend({
    el: $('#phases'),
    events: {
        'click .map':   'toggleMap'
    },
    cookieName: 'mapIsOpen',
    openHeight: 150,
    closedHeight: 40.4,
    

    initialize: function() {
        if(this.el.find('img.orbital').length === 0) {
            return;
        }

        this.el.find('ul').append('<li><a href="#" class="map">Show map</a></li>');
        if (this.getIsOpen()) {
            this.el.css({height: this.openHeight});
            this.el.addClass("open");
        }
    },

    toggleMap: function() {
        var height;
        var isOpen = this.getIsOpen();
        if (isOpen) {
            height = this.closedHeight;
        }
        else {
            height = this.openHeight;
        }
        this.el.toggleClass('open', !isOpen);
        this.el.stop().animate({height: height});
        this.setIsOpen(!isOpen);
        return false;
    },

    getIsOpen: function() {
        if ($.cookie(this.cookieName) == 'true') {
            return true;
        }
        else {
            return false;
        }
    },

    setIsOpen: function(v) {
        $.cookie(this.cookieName, v, {path: '/'});
    }
});


$(function() {
    Artemis.phasesView = new Artemis.PhasesView();
    Artemis.transcriptView = new Artemis.TranscriptView();
    Artemis.transcriptView.gatherCurrentSelection();
});


