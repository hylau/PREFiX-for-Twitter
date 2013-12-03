var ce = chrome.extension;
var bg_win = ce.getBackgroundPage();
var Ripple = bg_win.Ripple;
var Deferred = bg_win.Deferred;
var lscache = bg_win.lscache;
var jEmoji = bg_win.jEmoji;
var PREFiX = bg_win.PREFiX;

var $body;
var $app;
var $textarea;
var $main;

var is_panel_mode = false;
var is_focused = true;
var $scrolling_elem;

var is_windows = navigator.platform.indexOf('Win') > -1;

var loading = false;
var is_on_top = true;
PREFiX.popupActive = true;

var lyric;

var r = PREFiX.user;

if (! r) {
	bg_win.initialize();
	close();
}

var usage_tips = bg_win.usage_tips;

function getViewHeight() {
	return lscache.get('popup_view_height') || 600;
}

function setViewHeight(height) {
	lscache.set('popup_view_height', Math.round(Math.max(600, height)));
	applyViewHeight();
}

function applyViewHeight() {
	var height = getViewHeight();
	$('body, #picture-overlay, #context-timeline').height(height);
	$main.height(height - parseInt($main.css('top'), 10));
}

var goTop = (function() {
	var s = 0;
	var current;
	var id;
	var stop = function() { };
	return function(e) {
		stopSmoothScrolling();
		stop();
		stop = function() {
			stop = function() { };
			cancelAnimationFrame(id);
		}
		if (e) {
			e.preventDefault && e.preventDefault();
			s = $main[0].scrollTop;
		}
		var breakpoint;
		id = requestAnimationFrame(function(timestamp) {
			if (breakpoint) {
				var diff = (timestamp - breakpoint) * 1.2;
				current = $main[0].scrollTop;
				if (s != current) {
					return stop();
				}
				var to = Math.floor(s / 1.15 / Math.max(1, diff / 32));
				$main[0].scrollTop = s = to;
			}
			if (s >= 1 || ! breakpoint) {
				breakpoint = timestamp;
				id = requestAnimationFrame(arguments.callee);
			};
		});
	}
})();

var registered_smooth_scroll_data = [];
function initSmoothScroll($target) {
	var id;
	var is_scrolling = false;
	var destination = null;
	var _stop = function() { };
	function runAnimation(dest) {
		if (dest !== undefined) {
			destination = Math.round(dest);
		}
		function renderFrame(timestamp) {
			if (! is_scrolling) return;

			if (breakpoint) {
				var progress = (timestamp - breakpoint) * 1.2;

				var pos = $target.scrollTop();
				var diff = destination - pos;
				var dist = Math.round(Math.min(1, progress / 32) * diff / 4);
				dist = dist || Math.abs(diff) / diff;

				var min_pos = 0;
				var max_pos = $target[0].scrollHeight - height;
				var this_pos = Math.max(min_pos, pos + dist);
				this_pos = Math.min(this_pos, max_pos);

				$target.scrollTop(this_pos);

				diff = destination - this_pos;
				if (! diff || [ min_pos, max_pos ].indexOf(this_pos) > -1) {
					return _stop();
				}
			}


			breakpoint = timestamp;
			id = requestAnimationFrame(renderFrame);
		}
		if (is_scrolling) return;
		var height = $target.height();
		is_scrolling = true;
		var breakpoint;
		id = requestAnimationFrame(renderFrame);
		_stop = function() {
			_stop = function() { };
			if ($target === $main) {
				stopSmoothScrolling = _stop;
			}
			destination = null;
			is_scrolling = false;
			cancelAnimationFrame(id);
		}
		if ($target === $main) {
			stopSmoothScrolling = _stop;
		}
	}
	$target.on('mousewheel', function(e, delta) {
		if (! PREFiX.settings.current.smoothScroll && e.flag !== true)
			return;
		e.preventDefault();
		destination = destination || $target.scrollTop();
		destination = Math.ceil(-delta * 120 + destination);
		runAnimation();
	});
	registered_smooth_scroll_data.push({
		elem: $target[0],
		run: runAnimation
	});
}
function stopSmoothScrolling() { }
function smoothScrollTo(destination) {
	registered_smooth_scroll_data.forEach(function(item) {
		if (item.elem === $scrolling_elem[0]) {
			item.run(destination);
		}
	});
}

var showNotification = (function() {
	var timeout;
	return function(text) {
		clearTimeout(timeout);
		$('#notification').text(text).css({
			display: 'inline-block',
			opacity: 0,
			'margin-top': '15px'
		}).animate({
			opacity: 1,
			'margin-top': '0px'
		});
		timeout = setTimeout(function() {
			$('#notification').fadeOut();
		}, 5000);
	}
})();

function showUsageTip() {
	if ($main[0].scrollTop) {
		setTimeout(showUsageTip, 100);
		return;
	}
	var pos = lscache.get('usage_tip_pos') || 0;
	pos = Math.min(pos, usage_tips.length);
	var tip = usage_tips[pos];
	if (! tip) {
		$('#usage-tip').remove();
		return;
	}
	$('#hide-usage-tip').click(function(e) {
		lscache.set('usage_tip_pos', usage_tips.length);
		$title.removeClass('show-usage-tip');
	});
	lscache.set('usage_tip_pos', ++pos);
	$('#usage-tip-content').html(tip);
	var $title = $('#title');
	$title.addClass('show-usage-tip');
	setTimeout(function() {
		$title.removeClass('show-usage-tip');
	}, 15000);
}

function count(e) {
	var length = computeLength(composebar_model.text);
	$app.toggleClass('over', length > 140);
}

function setContent(content) {
	composebar_model.text = content.trim().replace(/\s+/g, ' ');
	count();
}

function getCurrent() {
	return window[PREFiX.current];
}

var last_draw_attention = new Date;
function drawAttention() {
	if (! is_panel_mode || is_focused) return;
	var now = new Date;
	if (now - last_draw_attention < 3000) return;
	last_draw_attention = now;
	setTimeout(function() {
		chrome.runtime.sendMessage({
			act: 'draw_attention'
		});
	}, 0);
}

function stopDrawingAttention() {
	chrome.runtime.sendMessage({
		act: 'stop_drawing_attention'
	});
}

function updateRelativeTime() {
	var current = getCurrent();
	if (! current || (! current.tweets && ! current.messages))
		return;
	(current.tweets || current.messages).forEach(function(s) {
		var created_at = (s.retweeted_status || s).created_at;
		s.relativeTime = getRelativeTime(created_at);
	});
}

var breakpoints = [];
function markBreakpoint() {
	breakpoints.push(Date.now());
}

function createTab(url, active) {
	chrome.tabs.create({
		url: url,
		active: active === true
	});	
}

function confirmFollowing() {
	r.follow({ screen_name: 'ruif' }).next(function() {
		showNotification('感谢关注 :)');
	});
	hideFollowingTip();
}

function denyFollowing() {
	hideFollowingTip();
}

function hideFollowingTip() {
	$('#follow-author').css({
		'animation-name': 'wobbleOut',
		'animation-duration': 400
	}).delay(400).hide(0, function() {
		$(this).remove();
		lscache.set('hide-following-tip', true);
	});
}

function showRatingPage() {
	var url = 'https://chrome.google.com/webstore/detail/prefix/gjpcbbbopajjjnkbkeaflldnocoppcpc/reviews';
	createTab(url, true);
	hideRatingTip();
}

function showRatingTip() {
	$('#rating-tip').show();
}

function hideRatingTip() {
	$('#rating-tip').css({
		'animation-name': 'wobbleOut',
		'animation-duration': 400
	}).delay(400).hide(0, function() {
		$(this).remove();
		lscache.set('hide-rating-tip', true);
	});
}

function sendDM(id, name) {
	if (id === PREFiX.account.id_str) return;
	composebar_model.text = '';
	composebar_model.type = 'send-dm';
	composebar_model.id = '';
	composebar_model.user = id;
	composebar_model.screen_name = name;
	focusToEnd();
}

function accumulateTime() {
	var time = lscache.get('timer') || 0;
	time++;

	if (time >= 600) {
		clearInterval(rating_interval);
		showRatingTip();
	}

	lscache.set('timer', time);
}

function focusToEnd() {
	$textarea.focus();
	var pos = composebar_model.text.length;
	$textarea[0].selectionStart = $textarea[0].selectionEnd = pos;
}

function setImage(file) {
	$textarea.css('text-indent', file ? '30px' : '');
	var size;
	if (file) {
		size = computeSize(file.size);
	}
	if (file && file.size > 2 * 1024 * 1024) {
		var msg = '您的图片文件大小 (' + size + ') 超过 2MB, 上传可能会失败.' +
			' 确定要继续吗?';
		if (! confirm(msg)) return;
	}
	var $upload = $('#uploading-photo');
	var title = '上传图片';
	if (file) {
		title = '取消上传 ' + file.name + ' (' +
			size + ')';
			$textarea.focus();
	}
	$upload.prop('title', title);
	$upload.toggleClass('file-selected', !! file);
	PREFiX.image = file;
	$textarea[0].focus();
	$textarea[0].blur();
	if (file) {
		$textarea.focus();
	}
}

function initMainUI() {
	$body = $('body');
	$app = $('#app');

	if (navigator.platform.indexOf('Linux') > -1) {
		$('html').attr('platform', 'linux');
	} else if (PREFiX.is_mac) {
		$('html').attr('platform', 'mac');
	}

	var ratio = +PREFiX.settings.current.zoomRatio;
	if (ratio !== 1 && is_panel_mode) {
		$body.css('zoom', ratio);
		$('<link />').
		prop('rel', 'stylesheet').
		prop('href', 'css/retina.css').
		appendTo('head');
		if (ratio > 1.4) {
			$('h2').css('letter-spacing', '.5px');
		}
	}

	if (! lscache.get('hide-following-tip')) {
		$('#confirm-following').click(confirmFollowing);
		$('#deny-following').click(denyFollowing);
		r.getUser({ screen_name: 'ruif' }).next(function(user) {
			if (user.following) denyFollowing();
		});
	} else {
		$('#follow-author').remove();
	}

	$(window).on('focus', function(e) {
		is_focused = true;
		stopDrawingAttention();
		markBreakpoint();
	}).on('blur', function(e) {
		is_focused = false;
	});

	$textarea = $('#compose-bar textarea');
	$textarea.autosize().atwho({
		at: '@',
		data: PREFiX.friends,
		search_key: 'string',
		tpl: '<li data-value="${screen_name}">${name} (@${screen_name})</li>'
	});

	$app.on({
		dragenter: function(e) {},
		dragover: function(e) {
			e.stopPropagation();
			e.preventDefault();
		},
		dragleave: function(e) {},
		drop: function(e) {
			e = e.originalEvent;

			e.stopPropagation();
			e.preventDefault();

			var file = e.dataTransfer.files[0];
			if (! file || ! isImage(file.type))
				return;

			if (file.type === 'image/png') {
				fixTransparentPNG(file).next(function(blob) {
					setImage(blob);
				});
			} else {
				setImage(file);
			}
		}
	});

	$('#uploading-photo').click(function(e) {
		if (! PREFiX.image) {
			if (! is_panel_mode && ! is_windows) {
				$('#new-window').click();
			}
			return;
		}
		setImage(null);
		var $copy = $file.clone(true);
		$file.replaceWith($copy);
		$file = $copy;
	});

	var $file = $('#file');
	$file.on('change', function(e) {
		var file = $(this)[0].files[0];
		if (! file || ! isImage(file.type))
			return;
		if (file.type === 'image/png') {
			fixTransparentPNG(file).next(function(blob) {
				setImage(blob);
			});
		} else {
			setImage(file);
		}
	});

	if (! is_windows && ! is_panel_mode) {
		$file.hide();
	}

	$(window).on('paste', function(e) {
		var e = e.originalEvent;
		var items = e.clipboardData.items;
		if (! items.length) return;
		var f, i = 0;
		while (items[i]) {
			f = items[i].getAsFile();
			if (f && isImage(f.type))	{
				break;
			}
			i++;
		}
		if (! f) return;
		f.name = 'image-from-clipboard.' + f.type.replace('image/', '');
		if (file.type === 'image/png') {
			fixTransparentPNG(f).next(function(blob) {
				setImage(f);
			});
		} else {
			setImage(f);
		}
	});

	setImage(PREFiX.image);

	$main = $scrolling_elem = $('#main');

	$main[0].onscroll = function(e) {
		this.scrollLeft = 0;
	}

	$main.scroll(_.throttle(function(e) {
		var scroll_top = $main.scrollTop();
		getCurrent().scrollTop = scroll_top;
		$app.toggleClass('on-top', scroll_top === 0);
		if (scroll_top + $main.height() >= $main[0].scrollHeight - ($main[0].clientHeight/2))
			loadOldder();
		if (scroll_top < 30)
			markBreakpoint();
	}, 100));

	$('#app').delegate('[data-send-dm]', 'click', function(e) {
		e.stopImmediatePropagation();
		e.preventDefault();
		var data = $(this).data('send-dm').split(':');
		sendDM(data[0], data[1]);
	}).delegate('a', 'click', function(e) {
		if (e.currentTarget.href.indexOf('http://') !== 0 &&
			e.currentTarget.href.indexOf('https://') !== 0)
			return;
		e.preventDefault();
		e.stopPropagation();
		createTab(e.currentTarget.href);
	}).delegate('.photo img', 'contextmenu', function(e) {
		var large_url = e.target.dataset.largeImg;
		if (large_url) {
			e.preventDefault();
			createTab(large_url);
		}
	}).delegate('.photo img', 'click', function(e) {
		showPicture(e.target.dataset.largeImg);
	});

	$('h1').click(function(e) {
		if ($main[0].scrollTop) {
			goTop(e);
		}
		if ($main[0].scrollTop < 30) {
			if (PREFiX.current === 'searches_model') {
				$('#topic-selector').trigger('change');
			} else {
				cutStream();
				PREFiX.update();
			}
		}
	});

	$('#new-window').click(function(e) {
		createPanel(400, getViewHeight(), '/popup.html?new_window=true');
		close();
	});

	$('#picture-overlay').click(function(e) {
		hidePicture();
	});

	$('#context-timeline').click(function(e) {
		if (! $(e.target).is('a') && ! $(e.target).is('img')) {
			$(this).removeClass('focusInFromBottom').addClass('focusOutFromTop');
			setTimeout(function() {
				$scrolling_elem = $main;
				$('body').removeClass('show-context-timeline');
			}, 250);
			if (showRelatedTweets.ajax) {
				showRelatedTweets.ajax.cancel();
			}
		}
	});
	
	$('#context-timeline ul').click(function(e) {
		if (! $(e.target).is('a') && ! $(e.target).is('img'))
			e.stopPropagation();
	});

	composebar_model.type = PREFiX.compose.type;
	composebar_model.id = PREFiX.compose.id;
	composebar_model.user = PREFiX.compose.user;
	composebar_model.screen_name = PREFiX.compose.screen_name;
	composebar_model.text = PREFiX.compose.text;
	if (PREFiX.compose.text) {
		focusToEnd();
	}

	[ $main, $('#context-timeline'), $('#picture-overlay') ].forEach(initSmoothScroll);

	$(window).on('keydown', function(e) {
		var $link;
		switch (e.keyCode) {
			case 49:
				$link = $('#navigation-bar .home-timeline');
				break;
			case 50:
				$link = $('#navigation-bar .mentions');
				break;
			case 51:
				$link = $('#navigation-bar .directmsgs');
				break;
			case 52:
				$link = $('#navigation-bar .saved-searches');
				break;
			default:
				return;
		}
		e.preventDefault();
		var event = new Event('click');
		$link[0].dispatchEvent(event);
	}).on('keydown', function(e) {
		switch (e.keyCode) {
			case 40: case 38:
				break;
			default:
				return;
		}
		e.preventDefault();
		var page_height = innerHeight / ratio;
		if ($scrolling_elem === $main) {
			page_height -= parseInt($main.css('top'), 10);
		}
		var current_pos = $scrolling_elem.scrollTop();
		var direction = e.keyCode === 40 ? 1 : -1;
		smoothScrollTo(current_pos + (page_height * direction));
	}).on('keydown', function(e) {
		if (e.keyCode !== 36) return;
		if ($scrolling_elem === $main)
			goTop(e);
		else
			smoothScrollTo(0);
	}).on('keydown', function(e) {
		if (e.keyCode !== 35) return;
		e.preventDefault();
		var full_height = $scrolling_elem[0].scrollHeight;
		var page_height = $scrolling_elem[0].clientHeight;
		var destination = full_height - page_height;
		if ($scrolling_elem.scrollTop() < destination)
			smoothScrollTo(destination);
	}).on('keydown', function(e) {
		switch (e.keyCode) {
			case 34: case 33:
				break;
			default:
				return;
		}
		e.preventDefault();
		var $win = $(window);
		var event;
		for (var i = 0; i < 4; i++) {
			event = new Event('keydown');
			event.keyCode = e.keyCode === 33 ? 38 : 40;
			dispatchEvent(event);
		}
	});

	resetLoadingEffect();

	setInterval(updateRelativeTime, 15000);
	setInterval(checkCount, 100);

	if (! lscache.get('hide-rating-tip')) {
		window.rating_interval = setInterval(accumulateTime, 60000);
		accumulateTime();
		$('#show-rating-page').click(showRatingPage);
		$('#hide-rating-tip').click(hideRatingTip);
	} else {
		$('#rating-tip').remove();
	}
}

function cutStream() {
	var current = getCurrent();
	var tweets_per_page = PREFiX.settings.current.tweetsPerPage;
	if (current.tweets) {
		current.tweets = current.tweets.slice(0, tweets_per_page);
	} else {
		current.messages = current.messages.slice(0, tweets_per_page);
	}
}

function computePosition(data) {
	var left = parseInt(($body[0].clientWidth - data.width) / 2, 10);
	var top = parseInt(($body[0].clientHeight - data.height) / 2, 10);
	data.left = Math.max(0, left);
	data.top = Math.max(0, top);
	for (var key in data) {
		data[key] += 'px';
	}
	return data;
}

function createPanel(width, height, url) {
	var size = getDefaultWindowSize(width, height);
	var options = {
		url: url,
		focused: true,
		type: 'panel',
		width: Math.round(size.width),
		height: Math.round(size.height),
		left: Math.round((screen.width - size.width) / 2),
		top: Math.round((screen.height - size.height) / 2)
	};
	chrome.windows.create(options);
}

function showPicture(img_url) {
	var $picture = $('#picture');
	$body.addClass('show-picture');
	if ($picture.prop('src') != img_url) {
		$picture.prop('src', img_url);
	}
	$picture.hide().removeClass('run-animation').css({
		'width': '',
		'height': ''
	});
	var $overlay = $scrolling_elem = $('#picture-overlay');
	$overlay.removeClass('error');
	$overlay.scrollTop(0);
	$picture.off().on('error', function(e) {
		$overlay.addClass('error');
		canceled = true;
	});
	var canceled = false;
	waitFor(function() {
		return $picture[0].naturalWidth || canceled;
	}, function() {
		if ($picture[0].naturalWidth > 400) {
			$picture.css('width', '400px');
		}
		var width = parseInt($picture.css('width'), 10);
		var height = parseInt($picture.css('height'), 10);
		$picture.css(computePosition({
			width: width / 2,
			height: height / 2
		})).
		css({
			opacity: .5,
			display: 'block'
		}).
		show().
		addClass('run-animation').
		css(computePosition({
			width: width,
			height: height
		})).
		css({
			opacity: 1,
			animation: 'pictureSlideIn .3s both'
		});
	});
}

function hidePicture() {
	$scrolling_elem = $main;
	var $picture = $('#picture');
	$picture.
	css(computePosition({
		width: parseInt($picture.css('width'), 10) / 2,
		height: parseInt($picture.css('height'), 10) / 2
	})).
	css({
		opacity: .5,
		animation: 'pictureSlideOut .3s both'
	});
	setTimeout(function() {
		$('body').removeClass('show-picture');
		$picture.removeClass('run-animation');
	}, 350);
}

var pre_count = {
	timeline: 0,
	mentions: 0,
	direct_messages: 0
};
function checkCount() {
	var count = PREFiX.count;
	var title_contents = [];
	var $home_tl = $('#navigation-bar .home-timeline .count');
	var $mentions = $('#navigation-bar .mentions .count');
	var $directmsgs = $('#navigation-bar .directmsgs .count');
	var $saved_searchs = $('#navigation-bar .saved-searches .count');
	if (count.mentions) {
		title_contents.push(count.mentions + ' @');
		$mentions.text(count.mentions).fadeIn(120);
		if (pre_count.mentions < count.mentions)
			drawAttention();
	} else {
		$mentions.text('').fadeOut(120);
	}
	pre_count.mentions = count.mentions;
	if (count.direct_messages) {
		title_contents.push(count.direct_messages + ' 私信');
		$directmsgs.text(count.direct_messages).fadeIn(120);
		if (pre_count.direct_messages < count.direct_messages)
			drawAttention();
	} else {
		$directmsgs.text('').fadeOut(120);
	}
	pre_count.direct_messages = count.direct_messages;
	var buffered = PREFiX.homeTimeline.buffered.filter(function(tweet) {
		return ! tweet.is_self;
	}).length;
	if (buffered) {
		title_contents.push(buffered + ' 新消息');
		$home_tl.text(Math.min(buffered, 99)).fadeIn(120);
	} else {
		$home_tl.text('').fadeOut(120);
	}
	var search_tweets_count = bg_win.getSavedSearchTweetsCount();
	if (search_tweets_count && PREFiX.settings.current.showSavedSearchCount) {
		title_contents.push(search_tweets_count + ' 关注话题消息');
		$saved_searchs.text(search_tweets_count).fadeIn(120);
	} else {
		$saved_searchs.text('').fadeOut(120);
	}
	var title = 'PREFiX';
	if (title_contents.length) {
		title += ' (' + title_contents.join(' / ') + ')';
	}
	document.title = title;
}

function resetLoadingEffect() {
	$('#loading').hide();
	setTimeout(function() {
		$('#loading').show();
	}, 0);
}

function insertKeepScrollTop(insert) {
	var scroll_top = $main[0].scrollTop;
	var scroll_height = $main[0].scrollHeight;
	insert();
	setTimeout(function() {
		$main.scrollTop(scroll_top + $main[0].scrollHeight - scroll_height);
	}, 50);
}

function loadOldder() {
	var model = getCurrent();
	if (model.allLoaded) return;
	if (model === searches_model) {
		var oldest_tweet = searches_model.tweets[searches_model.tweets.length - 1];
		if (! oldest_tweet) return;
		var $selector = $('#topic-selector');
		var k = $selector.val();
		if (k !== '##PUBLIC_TIMELINE##') {
			var id = oldest_tweet.id_str;
			r.searchTweets({
				q: k,
				max_id: id,
			}).setupAjax({
				lock: loadOldder,
				send: function() {
					loading = true;
				},
				oncomplete: function() {
					loading = false;
				}
			}).next(function(data) {
				var tweets = data.statuses;
				if (tweets && tweets.length) {
					if (tweets[0].id_str === id) {
						tweets.splice(0, 1);
					}
				}
				if (tweets && ! tweets.length) {
					model.allLoaded = true;
				} else {
					push(searches_model.tweets, tweets);
				}
			});
		}
	} else if (model.tweets) {
		var oldest_tweet = model.tweets[model.tweets.length - 1];
		if (! oldest_tweet) return;
		var id = oldest_tweet.id_str;
		r[model === tl_model ? 'getHomeTimeline' : 'getMentions']({
			max_id: id,
			count: PREFiX.settings.current.tweetsPerPage
		}).setupAjax({
			lock: loadOldder,
			send: function() {
				loading = true;
			},
			oncomplete: function() {
				loading = false;
			}
		}).error(function(e) {
			if (e.status && e.response) {
				showNotification(e.response.errors[0].message);
			} else {
				showNotification('加载时出现错误, 请检查网络连接.')
			}
			throw e;
		}).next(function(tweets) {
			if (tweets && tweets.length) {
				if (tweets[0].id_str === id) {
					tweets.splice(0, 1);
				}
			}
			if (tweets && ! tweets.length) {
				model.allLoaded = true;
				return;
			} else {
				push(model.tweets, tweets);
			}
		});
	} else {
		var oldest_message = model.messages[model.messages.length - 1];
		if (! oldest_message) return;
		var id = oldest_message.id_str;
		r.getDirectMessages({
			max_id: id,
			count: PREFiX.settings.current.tweetsPerPage
		}).setupAjax({
			lock: loadOldder,
			send: function() {
				loading = true;
			},
			oncomplete: function() {
				loading = false;
			}
		}).error(function(e) {
			if (e.status && e.response) {
				showNotification(e.response.errors[0].message);
			} else {
				showNotification('加载时出现错误, 请检查网络连接.')
			}
			throw e;
		}).next(function(messages) {
			if (messages && messages.length) {
				if (messages[0].id_str === id) {
					messages.splice(0, 1);
				}
			}
			if (messages && ! messages.length) {
				model.allLoaded = true;
				return;
			}
			push(directmsgs_model.messages, messages);
		});
	}
}

function remove(e) {
	showNotification('正在删除..')
	var self = this;
	var tweet_id = self.$vmodel.tweet.id_str;
	r.destroyTweet({ 
		id: tweet_id 
	}).setupAjax({
		lock: self
	}).error(function(e) {
		if (e.status !== 404 && e.response) {
			showNotification(e.response.errors[0].message);
			throw e;
		}
	}).next(function() {
		showNotification('删除成功!');
		$(self).parents('li').slideUp(function() {
			self.$vmodel.$remove();
		});
	});
}

function reply() {
	var tweet = this.$vmodel.tweet;
	composebar_model.type = 'reply';
	composebar_model.id = (tweet.retweeted_status || tweet).id_str;
	var at_users = { };
	at_users[tweet.user.screen_name] = true;
	if (tweet.retweeted_status) {
		at_users[tweet.retweeted_status.user.screen_name] = true;
	}
	var prefix = '@' + tweet.user.screen_name + ' ';
	if (tweet.retweeted_status) {
		prefix += '@' + tweet.retweeted_status.user.screen_name + ' ';
	}
	tweet.entities.user_mentions.forEach(function(user) {
		at_users[user.screen_name] = true;
	});
	var ated_users = [ 
		tweet.user.screen_name, 
		tweet.retweeted_status && tweet.retweeted_status.user.screen_name
	];
	var value = prefix + Object.keys(at_users).map(function(user) {
		if (user === PREFiX.account.screen_name) return '';
		return ated_users.indexOf(user) > -1 ? '' : ('@' + user + ' ');
	}).join('');
	composebar_model.text = value;
	$textarea.focus();
	$textarea[0].selectionStart = prefix.length;
	$textarea[0].selectionEnd = value.length;
}

function retweet(vm) {
	return function() {
		var $vm = window[vm];
		var $vmodel = this.$vmodel;
		var tweet = $vmodel.tweet;
		if (tweet.is_self && ! tweet.retweeted) {
			return repost.apply(this, arguments);
		}
		if (tweet.user.protected && ! tweet.retweeted_status) {
			return repost.apply(this, arguments);
		}
		showNotification((tweet.retweeted ? '取消' : '正在') + '锐推..');
		if (tweet.retweeted) {
			r.destroyTweet({
				id: tweet.id_str
			}).next(function(tweet) {
				$vm.tweets.splice($vmodel.$index, 1, tweet.retweeted_status);
			});
		} else {
			r.retweet({ 
				id: (tweet.retweeted_status || tweet).id_str
			}).next(function(tweet) {
				$vm.tweets.splice($vmodel.$index, 1, tweet);
				showNotification('锐推成功!');
			});
		}
	}
}

function repost(e) {
	e.preventDefault();
	composebar_model.type = 'repost';
	composebar_model.id = '';
	var tweet = this.$vmodel.tweet;
	tweet = tweet.retweeted_status || tweet;
	var value = 'RT@' + tweet.user.screen_name + ' ' + tweet.text;
	composebar_model.text = value;
	$textarea.focus();
	$textarea[0].selectionStart = $textarea[0].selectionEnd = 0;
}

function toggleFavourite(e) {
	var self = this;
	var tweet = self.$vmodel.tweet;
	tweet = tweet.retweeted_status || tweet;
	$(self).css('animation', '');
	showNotification(tweet.favorited ? '取消收藏..' : '正在收藏..')
	r[tweet.favorited ? 'unfavorite' : 'favorite']({
		id: tweet.id_str
	}).setupAjax({
		lock: self
	}).next(function() {
		tweet.favorited = ! tweet.favorited;
		showNotification(tweet.favorited ? '收藏成功!' : '取消收藏成功!');
		$(self).css('animation', 'spring .5s linear');
	});
}

function showRelatedTweets(e) {
	$body.addClass('show-context-timeline');
	var $context_tl = $scrolling_elem = $('#context-timeline');
	$context_tl.removeClass('focusOutFromTop').addClass('focusInFromBottom loading');
	$context_tl.scrollTop(0);
	context_tl_model.tweets = [];
	var tweet = this.$vmodel.tweet.$model;
	var tweets = [];
	(function get() {
		push(tweets, [ tweet ]);
		var id = tweet.in_reply_to_status_id_str;
		if (id) {
			showRelatedTweets.ajax = r.showTweet({ id: id }).next(function(s) {
				tweet = s;
				get();
			}).error(function() {
				$context_tl.removeClass('loading');
				unshift(context_tl_model.tweets, tweets, true);
			});
		} else {
			$context_tl.removeClass('loading');
			unshift(context_tl_model.tweets, tweets, true);
		}
	})();
}

var nav_model = avalon.define('navigation', function(vm) {
	vm.current = PREFiX.current;
	vm.showHomeTimeline = function(e) {
		if (loading) return;
		if (vm.current == 'tl_model' && $main.scrollTop())
			return goTop(e);
		PREFiX.current = vm.current = 'tl_model';
		tl_model.initialize();
	}
	vm.showMentions = function(e) {
		if (loading) return;
		if (vm.current == 'mentions_model' && $main.scrollTop())
			return goTop(e);
		PREFiX.current = vm.current = 'mentions_model';
		mentions_model.initialize();
	}
	vm.showdirectmsgs = function(e) {
		if (loading) return;
		if (vm.current == 'directmsgs_model' && $main.scrollTop())
			return goTop(e);
		PREFiX.current = vm.current = 'directmsgs_model';
		directmsgs_model.initialize();
	}
	vm.showSavedSearches = function(e) {
		if (loading) return;
		if (vm.current == 'searches_model' && $main.scrollTop())
			return goTop(e);
		PREFiX.current = vm.current = 'searches_model';
		searches_model.initialize();
	}
	vm.$watch('current', function(new_value, old_value) {
		if (old_value == 'directmsgs_model') {
			composebar_model.type = '';
		}
		if (old_value == 'searches_model') {
			$('#topic-selector').hide();
		}
		if (new_value == 'searches_model') {
			$('#topic-selector').show();
		}
		getCurrent().allLoaded = false;
		window[old_value] && window[old_value].unload();
		$('#navigation-bar li').removeClass('current');
		$('#stream > ul').removeClass('current');
		updateRelativeTime();
		resetLoadingEffect();
	});
});

var composebar_model = avalon.define('composebar-textarea', function(vm) {
	vm.text = vm.type = vm.id = vm.user = vm.screen_name = '';
	vm.submitting = false;
	vm.onfocus = function(e) {
		var placeholder = lyric = lyric || getLyric();
		if (vm.screen_name) {
			if (! vm.id) {
				placeholder = '发送私信给 @' + vm.screen_name;
			} else {
				placeholder = '回复 @' + vm.screen_name + ' 的私信';
			}
		}
		$textarea.prop('placeholder', placeholder);
	}
	vm.onblur = function(e) {
		$textarea.prop('placeholder', '');
		if (! vm.text.length) {
			vm.type = '';
			vm.id = '';
			vm.user = '';
			vm.screen_name = '';
		}
	}
	vm.ondblclick = function(e) {
		if (e.ctrlKey || e.metaKey) {
			if (! vm.text.trim()) {
				vm.text = $textarea.prop('placeholder');
			}
		}
		return vm.onkeydown({
			ctrlKey: true,
			keyCode: 13
		});
	}
	vm.onkeydown = function(e) {
		e.stopPropagation && e.stopPropagation();
		var value = $textarea.val().trim();
		if ((! value && ! PREFiX.image) || vm.submitting) return;
		if (e.keyCode === 13 && (e.ctrlKey || e.metaKey)) {
			e.preventDefault && e.preventDefault();
			if (computeLength(value) > 140) return;
			vm.submitting = true;
			showNotification('正在提交..');
			var data = {
				status: vm.text.trim()
			};
			if (vm.type === 'reply') {
				data.in_reply_to_status_id = vm.id;
			}
			if (vm.type === 'send-dm') {
				r.createDirectMessage({
					user_id: vm.user,
					text: vm.text.trim()
				}).setupAjax({
					lock: vm
				}).next(function() {
					showNotification('发表成功!');
					vm.text = '';
				}).error(function(e) {
					if (e.status && e.response) {
						showNotification(e.response.errors[0].message);
					} else {
						showNotification('发送失败, 请检查网络连接.')
					}
				}).next(function() {
					vm.submitting = false;
				});
			} else {
				var $compose_bar = $('#compose-bar');
				var full_length = $compose_bar.width();
				data.status = vm.text;
				data['media[]'] = PREFiX.image;
				r[ PREFiX.image ? 'uploadPhoto' : 'postTweet' ](data).
				setupAjax({
					timeout: PREFiX.image ? 180000 : 30000,
					onstart: function(e) {
						if (PREFiX.image) {
							$textarea.css('background-size', '48px 1px');
							$compose_bar.addClass('uploading');
						}
					},
					onprogress: function(e) {
						if (! PREFiX.image || ! e.lengthComputable) return;
						var percent = e.loaded / e.total;
						var green_length = Math.round(percent * full_length);
						$textarea.css('background-size', Math.max(48, green_length) + 'px 1px');
					},
					oncomplete: function(e) {
						$compose_bar.removeClass('uploading');
						$textarea.css('background-size', '');
					}
				}).next(function(tweet) {
					showNotification('发表成功!');
					vm.text = '';
					setImage(null);
					PREFiX.update(7, tweet.id).next(function() {
						if (PREFiX.current === 'tl_model') {
							var now = new Date;
							waitFor(function() {
								return tl_model.tweets.some(function(s) {
										return tweet.id == s.id;
									}) || ((new Date) - now > 5000);
							}, function() {
								if ($main[0].scrollTop < $main.height() / 2) {
									setTimeout(function() {
										goTop(true);
									}, 100);
								}
							});
						}
					});
				}).setupAjax({
					lock: vm
				}).error(function(e) {
					if (e.status && e.response) {
						showNotification(e.response.errors[0].message);
					} else {
						showNotification('发送失败, 请检查网络连接.')
					}
				}).next(function() {
					vm.submitting = false;
				});
			}
		}
	}
	vm.$watch('text', function(value) {
		if (! value && nav_model.current != 'directmsgs_model') {
			vm.type = '';
			vm.id = '';
			vm.user = '';
			vm.screen_name = '';
		}
		$textarea.toggleClass('filled', !! value);
		count();
		PREFiX.compose.text = value;
	});
	vm.$watch('type', function(value) {
		PREFiX.compose.type = value;
	});
	vm.$watch('id', function(value) {
		PREFiX.compose.id = value;
	});
	vm.$watch('user', function(value) {
		PREFiX.compose.user = value;
	});
	vm.$watch('screen_name', function(value) {
		PREFiX.compose.screen_name = value;
	});
});

var tl_model = avalon.define('home-timeline', function(vm) {
	vm.remove = remove;

	vm.reply = reply;

	vm.repost = repost;

	vm.retweet = retweet('tl_model');

	vm.toggleFavourite = toggleFavourite;

	vm.showRelatedTweets = showRelatedTweets;
	
	vm.tweets = [];

	vm.scrollTop = 0;

	vm.$watch('scrollTop', function(value) {
		PREFiX.homeTimeline.scrollTop = value;
	});
});
tl_model.tweets.$watch('length', function() {
	PREFiX.homeTimeline.tweets = tl_model.$model.tweets;
});
tl_model.initialize = function() {
	$('#navigation-bar .home-timeline').addClass('current');
	$('#title h2').text('Timeline');
	$('#home-timeline').addClass('current');

	var tl = PREFiX.homeTimeline;
	waitFor(function() {
		return tl.tweets.length;
	}, function() {
		tl_model.tweets = tl.tweets;
		markBreakpoint();
		setTimeout(function() {
			$main.scrollTop(PREFiX.homeTimeline.scrollTop);
		}, 50);
		updateRelativeTime();
	});

	this.interval = setInterval(function update() {
		if (! tl.buffered.length) {
			pre_count.timeline = 0;
			return;
		}
		if (tl.buffered.length !== pre_count.timeline) {
			if (PREFiX.settings.current.drawAttention)
				drawAttention();
			pre_count.timeline = tl.buffered.length;
		}
		if (! is_focused || $main[0].scrollTop) return;
		var buffered = tl.buffered;
		tl.buffered = [];
		if (! tl.tweets.length) {
			unshift(tl_model.tweets, buffered);
		} else {
			setTimeout(function() {
				insertKeepScrollTop(function() {
					if (buffered.length >= 50) {
						var now = Date.now();
						var is_breakpoint = breakpoints.some(function(time) {
							return Math.abs(time - now) < 500;
						});
						if (is_breakpoint) {
							var oldest_tweet = fixTweetList(buffered).reverse()[0];
							oldest_tweet.is_breakpoint = true;
							oldest_tweet.loaded_at = 'Loaded @ ' + getShortTime(now) + '.';
						}
					}
					unshift(tl_model.tweets, buffered);
				});
			}, 50);
		}

		PREFiX.updateTitle();
	}, 16);
}
tl_model.unload = function() {
	clearInterval(this.interval);
}

var mentions_model = avalon.define('mentions', function(vm) {
	vm.remove = remove;

	vm.reply = reply;

	vm.repost = repost;

	vm.retweet = retweet('mentions_model');

	vm.toggleFavourite = toggleFavourite;
	
	vm.showRelatedTweets = showRelatedTweets;

	vm.tweets = [];

	vm.scrollTop = 0;

	vm.$watch('scrollTop', function(value) {
		PREFiX.mentions.scrollTop = value;
	});
});
mentions_model.tweets.$watch('length', function() {
	PREFiX.mentions.tweets = mentions_model.$model.tweets;
});
mentions_model.initialize = function() {
	$('#navigation-bar .mentions').addClass('current');
	$('#title h2').text('Mentions');
	$('#mentions').addClass('current');

	var mentions = PREFiX.mentions;
	waitFor(function() {
		return mentions.tweets.length;
	}, function() {
		mentions_model.tweets = mentions.tweets;
		setTimeout(function() {
			$main.scrollTop(PREFiX.mentions.scrollTop);
		}, 50);
		updateRelativeTime();
	});

	this.interval = setInterval(function update() {
		if (! mentions.buffered.length) {
			pre_count.mentions = 0;
			return;
		}
		if (mentions.buffered.length !== pre_count.mentions) {
			if (PREFiX.settings.current.drawAttention)
				drawAttention();
			pre_count.mentions = mentions.buffered.length;
		}
		if (! is_focused || $main[0].scrollTop)
			return;

		var buffered = mentions.buffered;
		mentions.buffered = [];

		if (! mentions.tweets.length) {
			unshift(mentions_model.tweets, buffered);
		} else {
			setTimeout(function() {
				insertKeepScrollTop(function() {
					unshift(mentions_model.tweets, buffered);
				});
			}, 50);
		}

		PREFiX.updateTitle();
	}, 16);
}
mentions_model.unload = function() {
	clearInterval(this.interval);
}

var directmsgs_model = avalon.define('directmsgs', function(vm) {
	vm.remove = function() {
		showNotification('正在删除..')
		var self = this;
		var message_id = self.$vmodel.message.id_str;
		r.destroyDirectMessage({ 
			id: message_id 
		}).setupAjax({
			lock: self
		}).error(function(e) {
			if (e.status !== 404 && e.response) {
				showNotification(e.response.errors[0].message);
				throw e;
			}
		}).next(function() {
			showNotification('删除成功!');
			$(self).parents('li').slideUp(function() {
				self.$vmodel.$remove();
			});
		});
	}

	vm.reply = function() {
		var message = this.$vmodel.message;
		composebar_model.text = '';
		composebar_model.type = 'send-dm';
		composebar_model.id = message.id_str;
		composebar_model.user = message.sender.id;
		composebar_model.screen_name = message.sender.name;
		$textarea.focus();
	}

	vm.messages = [];

	vm.scrollTop = 0;

	vm.$watch('scrollTop', function(value) {
		PREFiX.directmsgs.scrollTop = value;
	});
});
directmsgs_model.messages.$watch('length', function() {
	PREFiX.directmsgs.messages = directmsgs_model.$model.messages;
});
directmsgs_model.initialize = function() {
	$('#navigation-bar .directmsgs').addClass('current');
	$('#title h2').text('Direct Messages');
	$('#directmsgs').addClass('current');

	var directmsgs = PREFiX.directmsgs;
	waitFor(function() {
		return directmsgs.messages.length;
	}, function() {
		directmsgs_model.messages = directmsgs.messages;
		setTimeout(function() {
			$main.scrollTop(PREFiX.directmsgs.scrollTop);
		}, 50);
		updateRelativeTime();
	});

	this.interval = setInterval(function update() {
		if (! directmsgs.buffered.length) {
			pre_count.directmsgs = 0;
			return;
		}
		if (directmsgs.buffered.length !== pre_count.directmsgs) {
			if (PREFiX.settings.current.drawAttention)
				drawAttention();
			pre_count.directmsgs = directmsgs.buffered.length;
		}
		if (! is_focused || $main[0].scrollTop)
			return;

		var buffered = directmsgs.buffered;
		directmsgs.buffered = [];

		if (! directmsgs.messages.length) {
			unshift(directmsgs_model.messages, buffered);
		} else {
			setTimeout(function() {
				insertKeepScrollTop(function() {
					unshift(directmsgs_model.messages, buffered);
				});
			}, 50);
		}

		PREFiX.updateTitle();
	}, 16);
}
directmsgs_model.unload = function() {
	clearInterval(this.interval);
}

var searches_model = avalon.define('saved-searches', function(vm) {
	vm.remove = remove;

	vm.reply = reply;

	vm.repost = repost;

	vm.retweet = retweet('searches_model');

	vm.toggleFavourite = toggleFavourite;

	vm.showRelatedTweets = showRelatedTweets;

	vm.keyword = PREFiX.keyword;

	vm.tweets = [];
});
searches_model.$watch('keyword', function() {
	PREFiX.keyword = searches_model.keyword;
});
searches_model.initialize = function() {
	$('#navigation-bar .saved-searches').addClass('current');
	$('#title h2').text('Discover');
	$('#saved-searches').addClass('current');

	$main.scrollTop(0);

	function showPublicTimeline() {
		searches_model.tweets = [];
		/*r.getPublicTimeline().next(function(tweets) {
			unshift(searches_model.tweets, tweets);
		});*/
	}

	function search() {
		var keyword = searches_model.keyword;
		searches_model.tweets = [];
		var tweets;
		bg_win.saved_searches_items.some(function(item) {
			if (item.keyword !== keyword) return;
			tweets = JSON.parse(JSON.stringify(item.tweets));
			lscache.set('saved-search-' + keyword + '-id', tweets[0].id_str);
			item.unread_count = 0;
			item.check();
			return true;
 		});
		unshift(searches_model.tweets, tweets);
	}

	function refreshCount() {
		bg_win.saved_searches_items.some(function(item) {
			$selector.find('option').each(function() {
				var $item = $(this);
				if ($item.val() === item.keyword) {
					var text = item.keyword;
					if (item.unread_count) {
						text += ' (' + item.unread_count + ')';
					}
					if (text !== $item.text()) {
						$item.text(text);
					}
				}
			});
		});
	}

	if (! $('#topic-selector').length) {
		var public_tl_id = '##PUBLIC_TIMELINE##';

		var $selector = $('<select />');
		$selector.prop('id', 'topic-selector');

		var $public_tl = $('<option />');
		$public_tl.text('随便看看');
		$public_tl.prop('value', public_tl_id);
		$selector.append($public_tl);

		bg_win.saved_searches_items.some(function(item) {
			var $item = $('<option />');
			$item.val(item.keyword);
			$item.text(item.keyword);
			$selector.append($item);
		});

		$selector.val(public_tl_id);
		$selector.appendTo('#title');

		$selector.on('change', function(e) {
			if (this.value === public_tl_id) {
				searches_model.keyword = '';
				showPublicTimeline();
			} else {
				searches_model.keyword = this.value;
				search();
			}
		});

		refreshCount();
	}

	var last = bg_win.saved_searches_items.some(function(item) {
		if (item.keyword === searches_model.keyword) {
			return !! item.unread_count;
		}
	});

	var $selector = $('#topic-selector');
	if (last) {
		$selector.val(searches_model.keyword);
	} else if (! last && bg_win.getSavedSearchTweetsCount()) {
		bg_win.saved_searches_items.some(function(item) {
			if (item.unread_count) {
				$selector.val(item.keyword);
				return true;
			}
		});
	} else if (searches_model.keyword) {
		$selector.val(searches_model.keyword);
	}
	$selector.trigger('change');

	this.interval = setInterval(refreshCount, 100);
}
searches_model.unload = function() {
	clearInterval(this.interval);
}

var context_tl_model = avalon.define('context-timeline', function(vm) {
	vm.tweets = [];
});
context_tl_model.tweets.$watch('length', function(length) {
	if (! length) return;
	var $context_tl = $('#context-timeline');
	$context_tl.find('li').each(function(i) {
		setTimeout(function() {
			$(this).show();
		}.bind(this), i * 100);
	});
});

$(function() {
	initMainUI();
	setTimeout(function() {
		$textarea.focus();
		if (! PREFiX.compose.text) {
			$textarea.blur();
		} else if (PREFiX.compose.type === 'repost') {
			$textarea[0].selectionStart = $textarea[0].selectionEnd = 0;
		}
		getCurrent().initialize();
		setTimeout(showUsageTip, 100);
		var $tip = $('#uploading-photo-tip');
		var shown = lscache.get('uploading_photo_tip');
		if (! shown) {
			$tip.show();
			$('#hide-uploading-photo-tip').click(function(e) {
				$tip.css({
					'animation-name': 'wobbleOut',
					'animation-duration': 400
				}).delay(400).hide(0, function() {
					$(this).remove();
					lscache.set('uploading_photo_tip', true);
				});
			});
		} else {
			$tip.remove();
	 	}
	}, 100);
});

onunload = function() {
	PREFiX.popupActive = false;
	if ($main[0].scrollTop < 30)
		cutStream();
}

if (location.search == '?new_window=true') {
	is_panel_mode = true;
	$('html').addClass('panel-mode');
	initFixSize(400, 600);
	$(applyViewHeight);
}

chrome.runtime.sendMessage({ });
